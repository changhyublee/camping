import { describe, expect, it } from "vitest";
import { ALL_TRIP_ANALYSIS_CATEGORIES, TRIP_ANALYSIS_CATEGORY_METADATA } from "@camping/shared";
import { AiJobEventBroker } from "../src/services/ai-job-event-broker";

describe("AiJobEventBroker", () => {
  it("publishes job lifecycle events to active subscribers", () => {
    const broker = new AiJobEventBroker();
    const receivedEventTypes: string[] = [];
    const unsubscribe = broker.subscribe((event) => {
      receivedEventTypes.push(event.type);
    });

    broker.publish(broker.createReadyEvent());
    broker.publish(broker.createHeartbeatEvent());
    broker.publishAnalysisStatus({
      trip_id: "2026-04-18-gapyeong",
      status: "running",
      requested_at: "2026-03-24T10:00:00.000Z",
      started_at: "2026-03-24T10:00:01.000Z",
      finished_at: null,
      output_path: null,
      categories: ALL_TRIP_ANALYSIS_CATEGORIES.map((category) => ({
        category,
        label: TRIP_ANALYSIS_CATEGORY_METADATA[category].label,
        sections: TRIP_ANALYSIS_CATEGORY_METADATA[category].sections,
        status: category === "summary" ? "running" : "idle",
        has_result: false,
        requested_at: null,
        started_at: null,
        finished_at: null,
        collected_at: null,
      })),
      completed_category_count: 0,
      total_category_count: ALL_TRIP_ANALYSIS_CATEGORIES.length,
    });
    broker.publishDurableMetadataStatus({
      item_id: "family-tent",
      status: "running",
      requested_at: "2026-03-24T10:00:00.000Z",
      started_at: "2026-03-24T10:00:01.000Z",
      finished_at: null,
    });
    broker.publishDurableMetadataCompleted(
      "family-tent",
      "2026-03-24T10:05:00.000Z",
    );

    expect(receivedEventTypes).toEqual([
      "ready",
      "heartbeat",
      "analysis-status",
      "durable-metadata-status",
      "durable-metadata-completed",
    ]);

    unsubscribe();
    broker.publish(broker.createHeartbeatEvent());
    expect(receivedEventTypes).toHaveLength(5);
  });

  it("isolates failing subscribers so job events keep publishing", () => {
    const broker = new AiJobEventBroker();
    const receivedEventTypes: string[] = [];

    broker.subscribe(() => {
      throw new Error("socket write failed");
    });
    broker.subscribe((event) => {
      receivedEventTypes.push(event.type);
    });

    broker.publish(broker.createReadyEvent());
    broker.publish(broker.createHeartbeatEvent());

    expect(receivedEventTypes).toEqual(["ready", "heartbeat"]);
  });
});
