export function log(event: string, data: Record<string, unknown> = {}) {
    process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), event, ...data }) + "\n");
}