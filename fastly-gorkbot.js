/// <reference types="@fastly/js-compute" />

import { Router } from "@fastly/expressly";
import { env } from "fastly:env";

// Discord API constants
const DISCORD_API_BASE = 'https://discord.com/api/v10';

// The two responses to randomly choose from
const RESPONSES = [
    "Yeh, nah",
    "Nah, yeh"
];

// Verify Discord signature
async function verifyDiscordSignature(request, body) {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    const publicKey = env('DISCORD_PUBLIC_KEY');
    
    if (!signature || !timestamp || !publicKey) {
        return false;
    }

    // Import the crypto key for verification
    const key = await crypto.subtle.importKey(
        'raw',
        hexToBytes(publicKey),
        {
            name: 'Ed25519',
            namedCurve: 'Ed25519',
        },
        false,
        ['verify']
    );

    // Verify the signature
    const isValid = await crypto.subtle.verify(
        'Ed25519',
        key,
        hexToBytes(signature),
        new TextEncoder().encode(timestamp + body)
    );

    return isValid;
}

// Helper function to convert hex string to bytes
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

// Create router
const router = new Router();

// Health check endpoint
router.get('/', async (req, res) => {
    return res.send('GorkBot is running on Fastly Compute!');
});

// Discord interactions endpoint
router.post('/interactions', async (req, res) => {
    const body = await req.text();
    
    // Verify the request is from Discord
    const isValid = await verifyDiscordSignature(req, body);
    if (!isValid) {
        return res.withStatus(401).send('Unauthorized');
    }

    const interaction = JSON.parse(body);

    // Handle ping from Discord
    if (interaction.type === 1) {
        return res.json({ type: 1 });
    }

    // Handle application commands
    if (interaction.type === 2) {
        const { data } = interaction;

        // Handle the /gork command
        if (data.name === 'gork') {
            const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
            
            return res.json({
                type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                data: {
                    content: response,
                    flags: 0 // Make response visible to everyone
                }
            });
        }

        // Handle the /gork-ephemeral command (only visible to user)
        if (data.name === 'gork-ephemeral') {
            const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
            
            return res.json({
                type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                data: {
                    content: response,
                    flags: 64 // EPHEMERAL - only visible to the user
                }
            });
        }
    }

    // Handle message components (buttons, select menus, etc.)
    if (interaction.type === 3) {
        const { data } = interaction;

        // Handle the "Ask Gork" button
        if (data.custom_id === 'ask_gork') {
            const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
            
            return res.json({
                type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                data: {
                    content: `🎱 ${response}`,
                    flags: 64 // EPHEMERAL
                }
            });
        }
    }

    return res.withStatus(400).send('Unknown interaction type');
});

// Register slash commands endpoint (for setup)
router.post('/register-commands', async (req, res) => {
    const applicationId = env('DISCORD_APPLICATION_ID');
    const botToken = env('DISCORD_BOT_TOKEN');

    if (!applicationId || !botToken) {
        return res.withStatus(400).send('Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN');
    }

    const commands = [
        {
            name: 'gork',
            description: 'Get a response from Gork',
            type: 1 // CHAT_INPUT
        },
        {
            name: 'gork-ephemeral',
            description: 'Get a private response from Gork (only you can see it)',
            type: 1 // CHAT_INPUT
        }
    ];

    try {
        const response = await fetch(`${DISCORD_API_BASE}/applications/${applicationId}/commands`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(commands)
        });

        if (response.ok) {
            return res.json({ message: 'Commands registered successfully!' });
        } else {
            const error = await response.text();
            return res.withStatus(response.status).send(`Failed to register commands: ${error}`);
        }
    } catch (error) {
        return res.withStatus(500).send(`Error: ${error.message}`);
    }
});

// Add a button demo endpoint
router.post('/send-button', async (req, res) => {
    const channelId = env('TEST_CHANNEL_ID'); // You'll need to set this
    const botToken = env('DISCORD_BOT_TOKEN');

    if (!channelId || !botToken) {
        return res.withStatus(400).send('Missing TEST_CHANNEL_ID or DISCORD_BOT_TOKEN');
    }

    const messageData = {
        content: "Click the button to ask Gork!",
        components: [
            {
                type: 1, // ACTION_ROW
                components: [
                    {
                        type: 2, // BUTTON
                        style: 1, // PRIMARY
                        label: "Ask Gork",
                        custom_id: "ask_gork",
                        emoji: {
                            name: "🎱"
                        }
                    }
                ]
            }
        ]
    };

    try {
        const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageData)
        });

        if (response.ok) {
            return res.json({ message: 'Button message sent!' });
        } else {
            const error = await response.text();
            return res.withStatus(response.status).send(`Failed to send message: ${error}`);
        }
    } catch (error) {
        return res.withStatus(500).send(`Error: ${error.message}`);
    }
});

// Handle all requests
addEventListener("fetch", (event) => {
    event.respondWith(router.handle(event.request));
});
