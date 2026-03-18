const axios = require('axios');

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = '8526352009:AAFvwOCNkueksZ_OODSQXySqarQL9iORTU0';
const TELEGRAM_CHAT_ID = '5301319697';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Send a message to Telegram
 * @param {string} message - The message to send
 * @returns {Promise} - Telegram API response
 */
async function sendTelegramMessage(message) {
  try {
    const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });

    console.log('✅ Telegram message sent successfully');
    return response.data;
  } catch (error) {
    console.error('❌ Error sending Telegram message:', error.message);
    throw error;
  }
}

/**
 * Format giveaway registration data for Telegram
 * @param {object} data - Registration form data
 * @param {string} giveawayName - Name of the giveaway
 * @returns {string} - Formatted message
 */
function formatGiveawayMessage(data, giveawayName) {
  const timestamp = new Date().toLocaleString();
  
  const message = `
<b>🎁 New Giveaway Registration</b>

<b>Giveaway:</b> ${giveawayName}
<b>Time:</b> ${timestamp}

<b>📋 Registration Details:</b>
<b>Full Name:</b> ${data.fullName}
<b>Email:</b> ${data.email}
<b>Phone:</b> ${data.phone}
<b>Country:</b> ${data.country}

<b>💬 Message:</b>
${data.message || 'No message provided'}

---
<i>Sent from TeslasCap Giveaway System</i>
  `.trim();

  return message;
}

/**
 * Send giveaway registration to Telegram
 * @param {object} registrationData - Form data
 * @param {string} giveawayName - Name of the giveaway
 * @returns {Promise}
 */
async function sendGiveawayRegistration(registrationData, giveawayName) {
  try {
    const message = formatGiveawayMessage(registrationData, giveawayName);
    const result = await sendTelegramMessage(message);
    return {
      success: true,
      message: 'Registration sent to Telegram successfully',
      telegramMessageId: result.result.message_id
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to send registration to Telegram',
      error: error.message
    };
  }
}

/**
 * Send a test message to verify bot is working
 * @returns {Promise}
 */
async function sendTestMessage() {
  try {
    const testMessage = `
<b>🧪 Test Message</b>

This is a test message from TeslasCap Giveaway System.
<b>Status:</b> ✅ Bot is working correctly!
<b>Time:</b> ${new Date().toLocaleString()}
    `.trim();

    const result = await sendTelegramMessage(testMessage);
    return {
      success: true,
      message: 'Test message sent successfully',
      result
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to send test message',
      error: error.message
    };
  }
}

module.exports = {
  sendTelegramMessage,
  formatGiveawayMessage,
  sendGiveawayRegistration,
  sendTestMessage
};
