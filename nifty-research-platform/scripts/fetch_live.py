#!/usr/bin/env python3
"""Fetch validated market data and RSS headlines for the static dashboard."""

from __future__ import annotations

import csv
import datetime as dt
import json
import math
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

try:
    import feedparser
except ImportError:
    feedparser = None

try:
    import yfinance as yf
except ImportError:
    yf = None

IST = ZoneInfo("Asia/Kolkata")
UTC = dt.timezone.utc
ALGORITHM_VERSION = "trend-v2"
INDEX_TICKERS = {
    "nifty50": ("Nifty 50", "^NSEI"),
    "sensex": ("Sensex", "^BSESN"),
    "banknifty": ("Bank Nifty", "^NSEBANK"),
}
RSS_FEEDS = (
    ("https://feeds.moneycontrol.com/rss/marketreports.xml", "Markets", "Moneycontrol"),
    ("https://feeds.moneycontrol.com/rss/business.xml", "Economy", "Moneycontrol"),
    ("https://feeds.bloomberg.com/markets/news.rss", "Global", "Bloomberg"),
)


def now_ist() -> dt.datetime:
    return dt.datetime.now(IST)


def iso_date(value: Any) -> str:
    if hasattr(value, "date"):
        return value.date().isoformat()
    return str(value)[:10]


def finite_positive(value: Any, minimum: float = 0.01) -> bool:
    try:
        number = float(value)
        return math.isfinite(number) and number > minimum
    except (TypeError, ValueError):
        return False


def read_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def read_summary_history(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if not finite_positive(row.get("Spot")):
                    continue
                rows.append(
                    {
                        "date": row["Date"],
                        "close": round(float(row["Spot"]), 2),
                        "vix": round(float(row["VIX"]), 2)
                        if finite_positive(row.get("VIX"))
                        else None,
                    }
                )
    except OSError as error:
        print(f"Could not read summary history: {error}")
    return sorted(rows, key=lambda item: item["date"])


def fetch_market_series(name: str, ticker: str) -> Optional[dict[str, Any]]:
    if yf is None:
        return None
    try:
        history = yf.Ticker(ticker).history(
            period="6mo", interval="1d", auto_adjust=False, actions=False
        )
        closes = history["Close"].dropna()
        if len(closes) < 2:
            raise ValueError("fewer than two closes returned")

        current = float(closes.iloc[-1])
        previous = float(closes.iloc[-2])
        if not finite_positive(current) or not finite_positive(previous):
            raise ValueError("invalid close returned")

        series = [
            {"date": iso_date(index), "close": round(float(value), 2)}
            for index, value in closes.tail(90).items()
            if finite_positive(value)
        ]
        return {
            "name": name,
            "ticker": ticker,
            "price": round(current, 2),
            "delta": round((current / previous - 1) * 100, 2),
            "session_date": series[-1]["date"],
            "series": series,
            "source": "Yahoo Finance",
            "stale": False,
        }
    except Exception as error:
        print(f"Could not fetch {name} ({ticker}): {error}")
        return None


def previous_market_value(
    previous: dict[str, Any], key: str, errors: list[str]
) -> Optional[dict[str, Any]]:
    value = previous.get("indices", {}).get(key)
    if isinstance(value, dict) and finite_positive(value.get("price")):
        retained = dict(value)
        retained["stale"] = True
        retained["retained_after_fetch_error"] = True
        errors.append(f"{key}: retained last good value")
        return retained
    errors.append(f"{key}: no valid value available")
    return None


def fetch_india_vix(
    previous: dict[str, Any], summary: list[dict[str, Any]], errors: list[str]
) -> Optional[dict[str, Any]]:
    fetched = fetch_market_series("India VIX", "^INDIAVIX")
    if fetched and 5 <= fetched["price"] <= 100:
        return {
            "value": fetched["price"],
            "change": round(
                fetched["series"][-1]["close"] - fetched["series"][-2]["close"], 2
            ),
            "session_date": fetched["session_date"],
            "series": fetched["series"],
            "source": fetched["source"],
            "ticker": fetched["ticker"],
            "stale": False,
        }

    prior = previous.get("vix")
    if (
        isinstance(prior, dict)
        and finite_positive(prior.get("value"), 4.99)
        and prior.get("source") != "Bank Nifty dispersion proxy"
    ):
        retained = dict(prior)
        retained["stale"] = True
        retained["retained_after_fetch_error"] = True
        errors.append("India VIX: retained last good value")
        return retained

    valid_summary = [item for item in summary if finite_positive(item.get("vix"), 4.99)]
    if valid_summary:
        latest = valid_summary[-1]
        previous_value = valid_summary[-2]["vix"] if len(valid_summary) > 1 else latest["vix"]
        errors.append("India VIX: using the latest bundled NSE summary value")
        return {
            "value": latest["vix"],
            "change": round(latest["vix"] - previous_value, 2),
            "session_date": latest["date"],
            "series": [
                {"date": item["date"], "close": item["vix"]}
                for item in valid_summary[-90:]
            ],
            "source": "Bundled NSE F&O summary CSV",
            "stale": True,
        }

    errors.append("India VIX: no valid value available")
    return None


def ema(values: list[float], period: int) -> Optional[float]:
    if len(values) < period:
        return None
    result = sum(values[:period]) / period
    multiplier = 2 / (period + 1)
    for value in values[period:]:
        result = value * multiplier + result * (1 - multiplier)
    return result


def wilder_rsi(values: list[float], period: int = 14) -> Optional[float]:
    if len(values) <= period:
        return None
    changes = [values[index] - values[index - 1] for index in range(1, len(values))]
    gains = [max(change, 0) for change in changes]
    losses = [max(-change, 0) for change in changes]
    average_gain = sum(gains[:period]) / period
    average_loss = sum(losses[:period]) / period
    for gain, loss in zip(gains[period:], losses[period:]):
        average_gain = (average_gain * (period - 1) + gain) / period
        average_loss = (average_loss * (period - 1) + loss) / period
    if average_loss == 0:
        return 100.0
    relative_strength = average_gain / average_loss
    return 100 - 100 / (1 + relative_strength)


def calculate_trend_lean(series: list[dict[str, Any]]) -> dict[str, Any]:
    closes = [float(item["close"]) for item in series if finite_positive(item.get("close"))]
    ema20 = ema(closes, 20)
    ema50 = ema(closes, 50)
    rsi14 = wilder_rsi(closes, 14)
    return5 = (closes[-1] / closes[-6] - 1) * 100 if len(closes) >= 6 else None

    score = 0
    reasons: list[str] = []
    if ema20 is not None and ema50 is not None:
        if ema20 > ema50:
            score += 1
            reasons.append(f"20-day EMA {ema20:.0f} is above 50-day EMA {ema50:.0f}")
        else:
            score -= 1
            reasons.append(f"20-day EMA {ema20:.0f} is below 50-day EMA {ema50:.0f}")
    else:
        reasons.append("Not enough history for both 20-day and 50-day EMAs")

    if return5 is not None:
        if return5 > 0:
            score += 1
            reasons.append(f"Five-session return is +{return5:.2f}%")
        elif return5 < 0:
            score -= 1
            reasons.append(f"Five-session return is {return5:.2f}%")
        else:
            reasons.append("Five-session return is flat")

    if rsi14 is not None:
        if rsi14 > 55:
            score += 1
            reasons.append(f"RSI(14) is {rsi14:.1f}, showing positive momentum")
        elif rsi14 < 45:
            score -= 1
            reasons.append(f"RSI(14) is {rsi14:.1f}, showing negative momentum")
        else:
            reasons.append(f"RSI(14) is neutral at {rsi14:.1f}")

    lean = "up" if score >= 2 else "down" if score <= -2 else "neutral"
    return {
        "lean": lean,
        "score": score,
        "reasons": reasons,
        "ema20": round(ema20, 2) if ema20 is not None else None,
        "ema50": round(ema50, 2) if ema50 is not None else None,
        "return_5d_pct": round(return5, 2) if return5 is not None else None,
        "rsi14": round(rsi14, 2) if rsi14 is not None else None,
        "algorithm_version": ALGORITHM_VERSION,
        "wording": "price-trend lean, not a prediction",
    }


def calculate_vix_range(nifty: Optional[dict[str, Any]], vix: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not nifty or not vix or not finite_positive(nifty.get("price")):
        return None
    if not finite_positive(vix.get("value"), 4.99):
        return None
    one_sigma = nifty["price"] * vix["value"] / 100 / math.sqrt(252)
    return {
        "range_1sigma": round(one_sigma, 2),
        "range_2sigma": round(one_sigma * 2, 2),
        "lower_1sigma": round(nifty["price"] - one_sigma, 2),
        "upper_1sigma": round(nifty["price"] + one_sigma, 2),
        "lower_2sigma": round(nifty["price"] - one_sigma * 2, 2),
        "upper_2sigma": round(nifty["price"] + one_sigma * 2, 2),
        "session_date": nifty.get("session_date"),
        "formula": "spot × annualized VIX ÷ 100 ÷ sqrt(252)",
    }


def parse_news_time(entry: Any, fallback: dt.datetime) -> str:
    published = entry.get("published") or entry.get("updated")
    if published:
        try:
            parsed = parsedate_to_datetime(published)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed.astimezone(IST).isoformat()
        except (TypeError, ValueError, OverflowError):
            pass
    return fallback.isoformat()


def fetch_news(previous: dict[str, Any], generated_at: dt.datetime, limit: int = 12) -> list[dict[str, Any]]:
    if feedparser is None:
        return previous.get("news", []) if isinstance(previous.get("news"), list) else []
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url, category, source in RSS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:8]:
                title = str(entry.get("title", "")).strip()[:180]
                link = str(entry.get("link", "")).strip()
                if not title or title in seen:
                    continue
                seen.add(title)
                items.append(
                    {
                        "title": title,
                        "category": category,
                        "source": source,
                        "date": parse_news_time(entry, generated_at),
                        "link": link if link.startswith(("https://", "http://")) else "",
                    }
                )
        except Exception as error:
            print(f"Could not fetch RSS feed {source}: {error}")
    if items:
        return sorted(items, key=lambda item: item["date"], reverse=True)[:limit]
    old_news = previous.get("news")
    return old_news if isinstance(old_news, list) else []


def next_realized_close(series: list[dict[str, Any]], after_date: str) -> Optional[dict[str, Any]]:
    return next((item for item in series if item["date"] > after_date), None)


def update_call_log(
    previous: dict[str, Any],
    trend: dict[str, Any],
    nifty: Optional[dict[str, Any]],
    generated_at: dt.datetime,
) -> list[dict[str, Any]]:
    old_calls = previous.get("calls")
    calls = [dict(item) for item in old_calls] if isinstance(old_calls, list) else []
    if (
        not nifty
        or not nifty.get("series")
        or not nifty.get("session_date")
        or not finite_positive(nifty.get("price"))
    ):
        return calls[-60:]

    series = nifty["series"]
    close_by_date = {item["date"]: float(item["close"]) for item in series}
    for call in calls:
        if call.get("resolved") or not call.get("input_session_date"):
            continue
        realized = next_realized_close(series, call["input_session_date"])
        input_close = close_by_date.get(call["input_session_date"], call.get("input_close"))
        if realized and finite_positive(input_close):
            move = (float(realized["close"]) / float(input_close) - 1) * 100
            actual = "up" if move > 0 else "down" if move < 0 else "flat"
            predicted = call.get("lean")
            call.update(
                {
                    "resolved": True,
                    "outcome_session_date": realized["date"],
                    "outcome_close": realized["close"],
                    "realized_move_pct": round(move, 3),
                    "actual_direction": actual,
                    "correct": predicted == actual if predicted in {"up", "down"} else None,
                }
            )

    session_date = nifty["session_date"]
    already_logged = any(call.get("input_session_date") == session_date for call in calls)
    latest_session_complete = session_date < generated_at.date().isoformat() or generated_at.time() >= dt.time(15, 30)
    if not already_logged and latest_session_complete:
        calls.append(
            {
                "input_session_date": session_date,
                "input_close": nifty["price"],
                "generated_at_ist": generated_at.isoformat(),
                "lean": trend["lean"],
                "reasons": trend["reasons"],
                "algorithm_version": ALGORITHM_VERSION,
                "resolved": False,
            }
        )
    return calls[-60:]


def market_state(generated_at: dt.datetime, latest_session_date: Optional[str]) -> str:
    if generated_at.weekday() >= 5:
        return "weekend"
    if generated_at.time() < dt.time(9, 15):
        return "pre-market"
    if generated_at.time() <= dt.time(15, 30):
        return "market-hours"
    if latest_session_date == generated_at.date().isoformat():
        return "closed"
    return "after-hours-awaiting-close"


def build_live_json(previous: dict[str, Any], summary: list[dict[str, Any]]) -> dict[str, Any]:
    generated_at = now_ist()
    errors: list[str] = []
    indices: dict[str, Any] = {}
    for key, (name, ticker) in INDEX_TICKERS.items():
        fetched = fetch_market_series(name, ticker)
        selected = fetched or previous_market_value(previous, key, errors)
        if selected:
            indices[key] = selected

    nifty = indices.get("nifty50")
    if nifty is not None and not nifty.get("series") and summary:
        nifty["series"] = [
            {"date": item["date"], "close": item["close"]} for item in summary[-90:]
        ]
    if nifty is None and summary:
        fallback_series = [
            {"date": item["date"], "close": item["close"]} for item in summary[-90:]
        ]
        latest = fallback_series[-1]
        prior = fallback_series[-2] if len(fallback_series) > 1 else latest
        nifty = {
            "name": "Nifty 50",
            "ticker": "bundled-summary",
            "price": latest["close"],
            "delta": round((latest["close"] / prior["close"] - 1) * 100, 2),
            "session_date": latest["date"],
            "series": fallback_series,
            "source": "Bundled NSE F&O summary CSV",
            "stale": True,
        }
        indices["nifty50"] = nifty

    vix = fetch_india_vix(previous, summary, errors)
    trend = calculate_trend_lean(nifty.get("series", []) if nifty else [])
    calls = update_call_log(previous, trend, nifty, generated_at)
    news = fetch_news(previous, generated_at)
    fresh_indices = sum(not value.get("stale", False) for value in indices.values())
    status = "success" if fresh_indices == 3 and vix and not vix.get("stale") else "partial"

    return {
        "schema_version": 2,
        "generated_at_ist": generated_at.isoformat(),
        "generated_at_utc": generated_at.astimezone(UTC).isoformat(),
        "market_hours_ist": "09:15-15:30",
        "market_state": market_state(generated_at, nifty.get("session_date") if nifty else None),
        "latest_session_date": nifty.get("session_date") if nifty else None,
        "indices": indices,
        "vix": vix,
        "vix_range": calculate_vix_range(nifty, vix),
        "trend_lean": trend,
        "calls": calls,
        "news": news,
        "log": {
            "status": status,
            "errors": errors,
            "message": "Latest completed session loaded" if status == "success" else "Some last good values were retained",
        },
    }


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    data_dir = project_root / "data"
    output_file = data_dir / "live.json"
    summary_file = data_dir / "nifty_pcr_maxpain.csv"
    data_dir.mkdir(parents=True, exist_ok=True)

    previous = read_json(output_file)
    summary = read_summary_history(summary_file)
    payload = build_live_json(previous, summary)

    temporary = output_file.with_suffix(".json.tmp")
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        temporary.replace(output_file)
        print(
            f"Wrote {output_file}: {payload['log']['status']}, "
            f"session {payload.get('latest_session_date')}"
        )
        return 0
    except OSError as error:
        print(f"Could not write {output_file}: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
