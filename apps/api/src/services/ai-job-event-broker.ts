import type {
  AiJobAnalysisStatusEvent,
  AiJobDurableMetadataCompletedEvent,
  AiJobDurableMetadataStatusEvent,
  AiJobEvent,
  AiJobHeartbeatEvent,
  AiJobReadyEvent,
  AnalyzeTripResponse,
  DurableMetadataJobStatusResponse,
} from "@camping/shared";

type AiJobEventListener = (event: AiJobEvent) => void;

export class AiJobEventBroker {
  private nextListenerId = 0;
  private readonly listeners = new Map<number, AiJobEventListener>();

  subscribe(listener: AiJobEventListener) {
    const listenerId = this.nextListenerId;
    this.nextListenerId += 1;
    this.listeners.set(listenerId, listener);

    return () => {
      this.listeners.delete(listenerId);
    };
  }

  publish(event: AiJobEvent) {
    const failedListenerIds: number[] = [];

    for (const [listenerId, listener] of this.listeners.entries()) {
      try {
        listener(event);
      } catch {
        failedListenerIds.push(listenerId);
      }
    }

    for (const listenerId of failedListenerIds) {
      this.listeners.delete(listenerId);
    }
  }

  createReadyEvent(): AiJobReadyEvent {
    return {
      type: "ready",
      connected_at: new Date().toISOString(),
    };
  }

  createHeartbeatEvent(): AiJobHeartbeatEvent {
    return {
      type: "heartbeat",
      sent_at: new Date().toISOString(),
    };
  }

  publishAnalysisStatus(status: AnalyzeTripResponse): AiJobAnalysisStatusEvent {
    const event = {
      type: "analysis-status",
      status,
    } satisfies AiJobAnalysisStatusEvent;

    this.publish(event);
    return event;
  }

  publishDurableMetadataStatus(
    status: DurableMetadataJobStatusResponse,
  ): AiJobDurableMetadataStatusEvent {
    const event = {
      type: "durable-metadata-status",
      status,
    } satisfies AiJobDurableMetadataStatusEvent;

    this.publish(event);
    return event;
  }

  publishDurableMetadataCompleted(
    itemId: string,
    completedAt = new Date().toISOString(),
  ): AiJobDurableMetadataCompletedEvent {
    const event = {
      type: "durable-metadata-completed",
      item_id: itemId,
      completed_at: completedAt,
    } satisfies AiJobDurableMetadataCompletedEvent;

    this.publish(event);
    return event;
  }
}
