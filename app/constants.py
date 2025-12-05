# app/constants.py
# Compact format headers for metrics API responses

MAIN_HEADERS: list[str] = [
    "main", "destination",
    "Min", "YMin", "Min_delta",
    "ACD", "YACD", "ACD_delta",
    "ASR", "YASR", "ASR_delta",
    "SCall", "YSCall", "SCall_delta",
    "TCall", "YTCall", "TCall_delta",
]

PEER_HEADERS: list[str] = [
    "main", "peer", "destination",
    "Min", "YMin", "Min_delta",
    "ACD", "YACD", "ACD_delta",
    "ASR", "YASR", "ASR_delta",
    "SCall", "YSCall", "SCall_delta",
    "TCall", "YTCall", "TCall_delta",
]

HOURLY_HEADERS: list[str] = [
    "main", "peer", "destination", "time",
    "Min", "YMin", "Min_delta",
    "ACD", "YACD", "ACD_delta",
    "ASR", "YASR", "ASR_delta",
    "SCall", "YSCall", "SCall_delta",
    "TCall", "YTCall", "TCall_delta",
]

FIVE_MIN_HEADERS: list[str] = [
    "main", "peer", "destination", "time", "slot",
    "Min", "YMin", "Min_delta",
    "ACD", "YACD", "ACD_delta",
    "ASR", "YASR", "ASR_delta",
    "SCall", "YSCall", "SCall_delta",
    "TCall", "YTCall", "TCall_delta",
]
