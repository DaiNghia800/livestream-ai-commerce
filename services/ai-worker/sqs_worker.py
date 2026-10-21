"""Move validated comment analysis from the input queue to the result queue."""

import json
import logging
import os

from process_comment import process_comment_event


logger = logging.getLogger(__name__)


def build_result(event: dict) -> dict:
    """Keep source identifiers stable so Commerce can deduplicate deliveries."""
    result = process_comment_event(event)
    if result["status"] != "ok":
        raise ValueError(f"Comment processing failed: {result['error_type']}")
    return {
        "schema_version": 1,
        "event_type": "comment.analyzed",
        "event_id": event["event_id"],
        "comment_id": event["comment_id"],
        "session_id": event["session_id"],
        "customer_id": event["customer_id"],
        "status": "ok",
        "intent": result["intent"],
    }


def run_once(sqs, input_queue_url: str, result_queue_url: str) -> int:
    """Delete the input only after SQS confirms that it stored the result."""
    response = sqs.receive_message(
        QueueUrl=input_queue_url, MaxNumberOfMessages=1,
        WaitTimeSeconds=20, VisibilityTimeout=120
    )
    processed = 0
    for message in response.get("Messages", []):
        try:
            event = json.loads(message["Body"])
            result = build_result(event)
            sqs.send_message(QueueUrl=result_queue_url, MessageBody=json.dumps(result))
            sqs.delete_message(
                QueueUrl=input_queue_url, ReceiptHandle=message["ReceiptHandle"]
            )
            processed += 1
        except (ValueError, KeyError, TypeError):
            logger.exception("Invalid comment event; awaiting input queue redrive")
        except Exception:
            logger.exception("SQS or AI processing failed; input remains for retry")
    return processed


def main() -> None:
    input_queue_url = os.environ.get("SQS_QUEUE_URL")
    result_queue_url = os.environ.get("AI_WORKER_RESULT_QUEUE_URL")
    if not input_queue_url or not result_queue_url:
        raise RuntimeError("Set SQS_QUEUE_URL and AI_WORKER_RESULT_QUEUE_URL")
    if input_queue_url == result_queue_url:
        raise RuntimeError("Input and result queues must be different")

    import boto3

    sqs = boto3.client("sqs", region_name=os.environ.get("AWS_REGION", "ap-southeast-1"))
    while True:
        run_once(sqs, input_queue_url, result_queue_url)


if __name__ == "__main__":
    main()
