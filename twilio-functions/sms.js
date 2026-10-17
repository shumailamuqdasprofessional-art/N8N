// Twilio Function: path /sms, visibility "Protected"
// Replies to every incoming SMS and (optionally) sends the message to n8n.
// Optional environment variable in the Functions service: N8N_WEBHOOK_URL
exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.MessagingResponse();
  twiml.message('Thanks for your message! We will reply soon.');

  if (context.N8N_WEBHOOK_URL) {
    try {
      await fetch(context.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'twilio_sms',
          From: event.From,
          To: event.To,
          Body: event.Body,
          MessageSid: event.MessageSid
        })
      });
    } catch (error) {
      console.error('Error forwarding to n8n:', error.message);
    }
  }

  return callback(null, twiml);
};
