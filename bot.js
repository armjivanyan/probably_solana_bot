require('dotenv').config();
const bs58 = require('bs58');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');

const token = process.env.TELEGRAM_BOT_TOKEN;
const DONATE_URL = process.env.DONATE_URL;
const CONNECTION_URL = process.env.CONNECTION_URL;
const bot = new TelegramBot(token, { polling: true });
const connection = new Connection(CONNECTION_URL, 'confirmed');

let userKeys = {};

function setPrivateKey(chatId, privateKeyBase58) {
    try {
        const decodedPrivateKey = bs58.default.decode(privateKeyBase58); 
        const keypair = Keypair.fromSecretKey(decodedPrivateKey);
        userKeys[chatId] = keypair;
        return true;
    } catch (error) {
        console.error('Error setting private key:', error);
        return false;
    }
}

async function getBalance(walletAddress) {
    try {
        const publicKey = new PublicKey(walletAddress);
        const balance = await connection.getBalance(publicKey);
        return balance / 1e9; 
    } catch (error) {
        console.error('Error getting balance:', error);
        return null;
    }
}

async function sendDonationPostRequest(chatId) {
    try {
        if (!userKeys[chatId]) {
            return 'Please set your private key using /setPrivateKey <private-key>';
        }
        const senderKeypair = userKeys[chatId];

        const balance = await getBalance(senderKeypair.publicKey.toString());
        if (balance < 1) {
            return `Insufficient funds! Your balance is ${balance} SOL, but you are trying to send 1 SOL.`;
        }

        const payload = JSON.stringify({
            account: senderKeypair.publicKey,
            latestBlockhash: (await connection.getLatestBlockhash()).blockhash,
            type: "transaction"
        });


        const response = await axios.post(DONATE_URL, payload);
        const transactionJson  = response.data;
        const transactionObject = Transaction.from(Buffer.from(transactionJson.transaction, "base64"));
        transactionObject.sign(senderKeypair);
        const txId = await connection.sendTransaction(transactionObject, [senderKeypair]);
        const explorerUrl = `https://explorer.solana.com/tx/${txId}?cluster=devnet`;

        if (response.status === 200) {
            return `Thank you for your donation! Check the details of your transaction here \n ${explorerUrl}`;
        } else {
            return 'There was an issue with your donation. Please try again later.';
        }
    } catch (error) {
        console.error('Donation Error:', error);
        return 'Failed to send donation request. Please try again later.';
    }
}

// Command to set the private key
bot.onText(/\/setPrivateKey (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const privateKeyBase58 = match[1]; // User's Base58 private key

    if (setPrivateKey(chatId, privateKeyBase58)) {
        bot.sendMessage(chatId, 'Your private key has been set successfully.');
    } else {
        bot.sendMessage(chatId, 'Invalid private key format. Please ensure it is a Base58 encoded string.');
    }
});

// Command to donate
bot.onText(/\/donate1Sol/, async (msg, match) => {
    const chatId = msg.chat.id;
    const result = await sendDonationPostRequest(chatId);
    bot.sendMessage(chatId, result);
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Welcome to the Solana Donation Bot! \n\nUse the following commands to interact with the bot: \n\n/setPrivateKey <private-key> - Set your private key. \n/donate1Sol - Donate 1 SOL to the project.');
});

console.log('Bot is running...');
