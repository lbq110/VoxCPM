import { config, voiceHeaders } from "@/lib/config";

// Proxy rename/delete of custom voices. action=rename|delete in the body.
export async function POST(req: Request) {
  const body = await req.json();
  const action = body.action === "delete" ? "delete" : "rename";
  try {
    const upstream = await fetch(`${config.voiceServerUrl}/voices/${action}`, {
      method: "POST",
      headers: voiceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: body.id, label: body.label }),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "voice server unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
