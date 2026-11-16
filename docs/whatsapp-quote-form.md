# WhatsApp quote form (WhatsApp Flow)

A short form that opens inside WhatsApp for customers the chat bot struggles with: they type
where from / where to, tap the right addresses (looked up on Google), choose date, time,
passengers, bags and one way / return, and submit. The fixed price arrives in the chat.

## When it's sent
- A typed place Google can't find (instead of "I couldn't find that on the map").
- The customer taps "None of these" on an address list.
- Claude decides the chat is going round in circles (`send_quote_form` action).
- The customer types "form" / "send me the form".

Only to numbers in `WHATSAPP_QUOTE_FORM` (wrangler.toml), and only once
`WHATSAPP_QUOTE_FORM_ID` is set.

## Pieces
- `shared/whatsapp-quote-form.ts`: the Flow JSON (`WHATSAPP_QUOTE_FORM_JSON`) and what each screen does.
- `workers/addresses/src/whatsapp-quote-form-endpoint.ts`: the encrypted data endpoint
  (`POST /whatsapp/quote-form`), key pair (made by the Worker, kept in KV) and
  `GET /whatsapp/quote-form/setup` (registers the public key with 360dialog / Meta).
- `workers/addresses/src/whatsapp-handlers.ts`: sending the form; a submitted form
  (`nfm_reply` webhook) goes on the quote and is priced as if the customer tapped Yes.

## Setting it up (once)
1. Deploy, then open `https://<worker>/whatsapp/quote-form/setup` — it registers the public key.
2. WhatsApp Manager → Flows → Create flow ("Get my price", category Other) → paste the JSON from
   `npx tsx -e 'import("./shared/whatsapp-quote-form.ts").then(m=>console.log(JSON.stringify(m.WHATSAPP_QUOTE_FORM_JSON,null,2)))'`.
3. Endpoint: `https://<worker>/whatsapp/quote-form` (Meta runs a health check).
4. Put the Flow id in `WHATSAPP_QUOTE_FORM_ID`, keep `WHATSAPP_QUOTE_FORM_MODE = "draft"`, deploy, test from the pilot number.
5. Publish the Flow in WhatsApp Manager, set `WHATSAPP_QUOTE_FORM_MODE = "published"`, then widen `WHATSAPP_QUOTE_FORM` (e.g. "all").

## Checks
`npx tsx scripts/check-whatsapp-quote-form.ts`
