// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/catalog/catalog-communications.ts
// ============================================================================
// Messaging, email, chat, conferencing, and notification destinations.
import { DestinationDefinition, D } from './destination-types';

export const COMMUNICATIONS: DestinationDefinition[] = [
  // SMS and omnichannel messaging.
  D('twilio', 'Twilio', 'messaging', 'https://api.twilio.com', 'basic', ['accountSid', 'authToken'], '/2010-04-01/Accounts', undefined, ['fromNumber']),
  D('termii', 'Termii', 'messaging', 'https://api.ng.termii.com', 'api-key-header', ['apiKey'], '/api/sender-id', 'Authorization', ['senderId']),
  D('africastalking', 'Africa\u2019s Talking', 'messaging', 'https://api.africastalking.com', 'api-key-header', ['apiKey', 'username'], '/version1/user', 'apiKey'),
  D('vonage', 'Vonage (Nexmo)', 'messaging', 'https://api.nexmo.com', 'api-key-header', ['apiKey', 'secretKey'], '/v1/get-account-info', 'api-key'),
  D('messagebird', 'MessageBird (Bird)', 'messaging', 'https://api.messagebird.com', 'api-key-header', ['apiKey'], '/v1/balance', 'Authorization'),
  D('sinch', 'Sinch', 'messaging', 'https://us.sms.api.sinch.com', 'bearer', ['accessToken'], '/v1/health'),
  D('plivo', 'Plivo', 'messaging', 'https://api.plivo.com', 'basic', ['username', 'password'], '/v1/Account'),
  D('telnyx', 'Telnyx', 'messaging', 'https://api.telnyx.com', 'bearer', ['apiKey'], '/v2/number_configurations'),
  D('infobip', 'Infobip', 'messaging', 'https://api.infobip.com', 'api-key-header', ['apiKey'], '/manage/1/accounts', 'Authorization'),
  D('clickatell', 'Clickatell', 'messaging', 'https://platform.clickatell.com', 'bearer', ['apiKey'], '/v1/health'),
  D('bulksmsnigeria', 'BulkSMSNigeria', 'messaging', 'https://www.bulksmsnigeria.com', 'api-key-header', ['apiKey'], '/api/v1/balance', 'Authorization'),
  D('bulksms', 'BulkSMS', 'messaging', 'https://api.bulksms.com', 'basic', ['username', 'password'], '/v1/credits'),
  D('bandwidth', 'Bandwidth', 'messaging', 'https://messaging.bandwidth.com', 'basic', ['username', 'password'], '/v1/users'),
  D('46elks', '46elks', 'messaging', 'https://api.46elks.com', 'basic', ['username', 'password'], '/v1/Me'),
  D('esendex', 'Esendex', 'messaging', 'https://www.esendex.com', 'basic', ['email', 'password'], '/v1.0/health'),
  D('textmagic', 'TextMagic', 'messaging', 'https://rest.textmagic.com', 'bearer', ['apiKey'], '/v2/user'),
  D('podium', 'Podium', 'messaging', 'https://api.podium.com', 'oauth-code', ['accessToken'], '/v1/health', undefined, ['refreshToken']),
  D('simpletexting', 'SimpleTexting', 'messaging', 'https://api-app2.simpletexting.com', 'bearer', ['apiKey'], '/v2/api/health'),
  D('textedly', 'Textedly', 'messaging', 'https://api.textedly.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('kaleyra', 'Kaleyra', 'messaging', 'https://api.kaleyra.io', 'api-key-header', ['apiKey'], '/v1/health', 'api-key'),
  D('tyntec', 'tyntec', 'messaging', 'https://api.tyntec.com', 'api-key-header', ['apiKey'], '/health', 'apikey'),
  D('cm-com', 'CM.com', 'messaging', 'https://gw.cmtelecom.com', 'api-key-header', ['apiKey'], '/v1/health', 'X-CM-PRODUCTTOKEN'),
  D('unifonic', 'Unifonic', 'messaging', 'https://api.unifonic.com', 'bearer', ['accessToken'], '/v1/health'),
  D('messagemedia', 'MessageMedia', 'messaging', 'https://api.messagemedia.com', 'basic', ['apiKey', 'password'], '/v1/health'),
  D('exotel', 'Exotel', 'messaging', 'https://api.exotel.com', 'basic', ['username', 'password'], '/v1/Accounts'),
  D('mtn-momo', 'MTN MoMo (Mobile Money)', 'payments', 'https://sandbox.momodeveloper.mtn.com', 'bearer', ['accessToken'], '/v1_0/apiuser', undefined, ['secretKey']),
  D('mpesa-daraja', 'Safaricom M-Pesa (Daraja)', 'payments', 'https://sandbox.safaricom.co.ke', 'basic', ['username', 'password'], '/v1/health', undefined, ['apiKey']),

  // Transactional email.
  D('sendgrid', 'SendGrid', 'email', 'https://api.sendgrid.com', 'bearer', ['apiKey'], '/v3/scopes'),
  D('mailgun', 'Mailgun', 'email', 'https://api.mailgun.net', 'basic', ['apiKey', 'domain'], '/v3/domains', undefined, ['region']),
  D('brevo', 'Brevo', 'email', 'https://api.brevo.com', 'api-key-header', ['apiKey'], '/v3/account', 'api-key'),
  D('mandrill', 'Mailchimp Transactional (Mandrill)', 'email', 'https://mandrillapp.com', 'api-key-header', ['apiKey'], '/api/1.0/users/ping2', 'Authorization'),
  D('postmark', 'Postmark', 'email', 'https://api.postmarkapp.com', 'api-key-header', ['apiKey'], '/server', 'X-Postmark-Server-Token'),
  D('sparkpost', 'SparkPost', 'email', 'https://api.sparkpost.com', 'api-key-header', ['apiKey'], '/api/v1/account', 'Authorization'),
  D('amazon-ses', 'Amazon SES', 'email', 'https://email.eu-west-1.amazonaws.com', 'api-key-header', ['apiKey'], '/health', 'Authorization', ['region']),
  D('resend', 'Resend', 'email', 'https://api.resend.com', 'bearer', ['apiKey'], '/domains'),
  D('elastic-email', 'Elastic Email', 'email', 'https://api.elasticemail.com', 'api-key-header', ['apiKey'], '/v2/account/profile', 'X-ElasticEmail-ApiKey'),
  D('mailjet', 'Mailjet', 'email', 'https://api.mailjet.com', 'bearer', ['apiKey'], '/v3/REST/user'),
  D('smtp2go', 'SMTP2GO', 'email', 'https://api.smtp2go.com', 'api-key-header', ['apiKey'], '/v3/health', 'Authorization'),
  D('socketlabs', 'SocketLabs', 'email', 'https://api.socketlabs.com', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('mailerlite', 'MailerLite', 'email', 'https://api.mailerlite.com', 'api-key-header', ['apiKey'], '/api/subscribers', 'Authorization'),
  D('moosend', 'Moosend', 'email', 'https://api.moosend.com', 'api-key-header', ['apiKey'], '/v1/me', 'X-Moosend-ApiKey'),

  // Chat and team messaging.
  D('discord', 'Discord', 'chat', 'https://discord.com', 'bearer', ['botToken'], '/api/v10/gateway', undefined, ['webhookUrl']),
  D('telegram', 'Telegram', 'chat', 'https://api.telegram.org', 'query-param', ['botToken'], '/bot{token}/getMe'),
  D('whatsapp-cloud', 'WhatsApp Cloud API', 'chat', 'https://graph.facebook.com', 'bearer', ['accessToken', 'phoneNumberId'], '/v21.0/me'),
  D('slack', 'Slack', 'chat', 'https://slack.com', 'bearer', ['botToken'], '/api/auth.test', undefined, ['channel']),
  D('microsoft-teams', 'Microsoft Teams', 'chat', 'https://graph.microsoft.com', 'bearer', ['accessToken'], '/v1/me', undefined, ['refreshToken']),
  D('chatwork', 'Chatwork', 'chat', 'https://api.chatwork.com', 'api-key-header', ['apiKey'], '/v1/me', 'X-ChatWorkToken'),
  D('viber', 'Viber Business Messages', 'chat', 'https://chatapi.viber.com', 'api-key-header', ['apiKey'], '/get_account_info', 'X-Viber-Auth-Token'),
  D('line', 'LINE Messaging API', 'chat', 'https://api.line.me', 'bearer', ['accessToken'], '/v2/profile', undefined, ['channel']),
  D('matrix', 'Matrix (Element)', 'chat', 'https://matrix.org', 'bearer', ['accessToken'], '/_matrix/client/v3/whoami'),
  D('zulip', 'Zulip', 'chat', 'https://api.zulip.com', 'bearer', ['apiKey'], '/api/v1/me'),

  // Meetings and video.
  D('zoom', 'Zoom', 'conferencing', 'https://api.zoom.us', 'oauth-code', ['accessToken'], '/v2/users/me', undefined, ['refreshToken']),
  D('webex', 'Cisco Webex', 'conferencing', 'https://webexapis.com', 'bearer', ['accessToken'], '/v1/people/me'),
  D('gotomeeting', 'GoTo Meeting', 'conferencing', 'https://api.getgo.com', 'oauth-code', ['accessToken'], '/G2M/rest/v2/health', undefined, ['refreshToken']),
  D('google-meet', 'Google Meet (Workspace)', 'conferencing', 'https://meet.googleapis.com', 'bearer', ['accessToken'], '/v1/health', undefined, ['refreshToken']),
  D('bluejeans', 'BlueJeans', 'conferencing', 'https://api.bluejeans.com', 'bearer', ['accessToken'], '/v1/user/me'),
  D('whereby', 'Whereby', 'conferencing', 'https://api.whereby.dev', 'bearer', ['accessToken'], '/v1/health'),

  // Push notifications.
  D('pushover', 'Pushover', 'notifications', 'https://api.pushover.net', 'api-key-header', ['apiKey'], '/1/users.json', 'token'),
  D('pushbullet', 'Pushbullet', 'notifications', 'https://api.pushbullet.com', 'api-key-header', ['apiKey'], '/v2/users/me', 'Access-Token'),
  D('onesignal', 'OneSignal', 'notifications', 'https://api.onesignal.com', 'basic', ['username', 'apiKey'], '/v1/health'),
  D('fcm', 'Firebase Cloud Messaging', 'notifications', 'https://fcm.googleapis.com', 'bearer', ['accessToken'], '/v1/health', undefined, ['refreshToken']),
  D('ntfy', 'ntfy', 'notifications', 'https://ntfy.sh', 'api-key-header', ['apiKey'], '/v1/health', 'Authorization'),
  D('apns-proxy', 'Pushy', 'notifications', 'https://api.pushy.me', 'api-key-header', ['apiKey'], '/health', 'Authorization'),
];
