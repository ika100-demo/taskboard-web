import { registerOTel } from "@vercel/otel";

/**
 * OpenTelemetry tracing. Exports only when OTEL_EXPORTER_OTLP_ENDPOINT is set
 * (standard OTel env var); otherwise tracing is a no-op.
 */
export function register() {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME ?? "taskboard-web" });
  }
}
