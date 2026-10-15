# Livestream AI Commerce — Agent Instructions

## Project context
- This is a student-built, microservices-based AI livestream commerce platform.
- Main areas include frontend, commerce, realtime, AI worker, database, infrastructure, and shared contracts.
- Treat existing code and approved documentation as the source of truth. Do not assume planned features are implemented.

## Development workflow
1. Inspect relevant code and documentation before proposing changes.
2. Explain the problem and proposed approach in Vietnamese.
3. For non-trivial changes, present a concise plan and wait for approval.
4. Implement one small, focused task at a time.
5. Add or update relevant tests, and run them when permitted.
6. Report changed files, actual test results, remaining risks, and what I should learn.

## Architecture and quality
- Preserve existing service boundaries and API/event contracts.
- Do not introduce shared database access across services without explicit approval.
- Do not change business rules, database schemas, or infrastructure without approval.
- Prefer simple, maintainable implementations over premature abstractions.
- Consider input validation, idempotency, concurrency, retries, and error handling where relevant.
- Follow existing naming, formatting, and project conventions.

## Testing
- Keep unit tests isolated and deterministic.
- Mock external AI, AWS, network, and database dependencies in unit tests.
- Place tests according to existing repository conventions; propose restructuring before moving files.
- Never claim tests passed unless they were actually executed.
- Distinguish unit, integration, and end-to-end tests.

## Security and Git
- Never expose or commit secrets, API keys, or .env values.
- Do not overwrite unrelated uncommitted changes.
- Never force-push, reset --hard, delete data, or execute destructive commands without explicit approval.
- Review diffs before suggesting commits.

## Learning mode
- Explain important technical decisions and unfamiliar concepts in Vietnamese.
- Use English for code comments, docstrings, and identifiers.
- Show the reasoning behind implementation choices and meaningful alternatives.
- Give one small learning exercise when appropriate.
- The student remains responsible for architecture and final code approval.