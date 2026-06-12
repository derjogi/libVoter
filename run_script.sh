#! /bin/bash
# Manually run the opt-in LIVE LLM test (hits the real model via OpenRouter).
# The test loads .env.local itself; LIVE_LLM=1 un-skips it.
# Override the number of iterations with LIVE_LLM_RUNS (default 3).
LIVE_LLM=1 bun run test tests/unit/live-chat-turn.test.ts
