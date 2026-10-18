# Offline demo: the existing CLI needs only the Python standard library.
FROM python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PYTHON_DOTENV_DISABLED=1

WORKDIR /app

COPY services/ai-worker/read_example.py \
     services/ai-worker/process_comment.py \
     services/ai-worker/parse_intent.py \
     services/ai-worker/intent_policy.py \
     services/ai-worker/quantity_parser.py \
     services/ai-worker/product_codes.py \
     services/ai-worker/ai_errors.py \
     /app/services/ai-worker/

COPY contracts/examples/comment-created.v1.json /app/contracts/examples/
COPY services/ai-worker/examples/needs-clarification.json \
     services/ai-worker/examples/no-purchase.json \
     /app/services/ai-worker/examples/
COPY contracts/test-fixtures/bad-json.json \
     contracts/test-fixtures/missing-content.json \
     contracts/test-fixtures/empty-content.json \
     contracts/test-fixtures/content-not-string.json \
     /app/contracts/test-fixtures/

# Numeric IDs avoid adding accounts or installing OS packages.
USER 10001:10001

# Keep offline mode in ENTRYPOINT so --allow-ai is rejected by the existing CLI.
ENTRYPOINT ["python", "-S", "-X", "utf8", "-B", "services/ai-worker/read_example.py", "--offline"]
CMD []
