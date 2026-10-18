import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export interface CommentCreatedEvent {
  schema_version: 1;
  event_id: string;
  event_type: "comment.created";
  occurred_at: string;
  comment_id: string;
  session_id: string;
  customer_id: string;
  content: string;
}

export interface SqsConfig {
  queueUrl?: string;
  region?: string;
}

export interface ISqsService {
  isConfigured(): boolean;
  sendCommentCreatedEvent(event: CommentCreatedEvent): Promise<boolean>;
}

export class SqsService implements ISqsService {
  private client: SQSClient | null = null;
  private queueUrl?: string;

  constructor(config: SqsConfig, customClient?: SQSClient) {
    this.queueUrl = config.queueUrl;
    if (customClient) {
      this.client = customClient;
    } else if (config.region || config.queueUrl) {
      this.client = new SQSClient({
        region: config.region || "ap-southeast-1",
      });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.queueUrl);
  }

  /**
   * Đẩy sự kiện comment.created vào Amazon SQS theo đúng schema hợp đồng
   */
  async sendCommentCreatedEvent(event: CommentCreatedEvent): Promise<boolean> {
    // Validate schema tuân thủ contracts/examples/comment-created.v1.json
    if (
      event.schema_version !== 1 ||
      event.event_type !== "comment.created" ||
      !event.event_id ||
      !event.comment_id ||
      !event.session_id ||
      !event.customer_id ||
      !event.occurred_at ||
      typeof event.content !== "string"
    ) {
      throw new Error("Invalid comment.created event payload");
    }

    if (!this.client || !this.queueUrl) {
      // Chế độ mô phỏng khi chưa cấu hình AWS SQS thật ở local
      console.log(
        `[SqsService] Simulated comment.created event to queue: comment_id=${event.comment_id}, content="${event.content}"`
      );
      return true;
    }

    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(event),
        MessageAttributes: {
          EventType: {
            DataType: "String",
            StringValue: "comment.created",
          },
          SessionId: {
            DataType: "String",
            StringValue: event.session_id,
          },
        },
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      console.error("[SqsService] Failed to send message to SQS:", error);
      throw error;
    }
  }
}
