const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { CronJob } = require('cron');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const token = process.env.TOKEN;
const remindersFilePath = path.join(__dirname, 'reminders.json');

let reminders = loadReminders();

// Command registration
const commands = [
    new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder for a specific date and time in UTC')
        .addStringOption(option => 
            option.setName('time')
                .setDescription('The time in HH:MM format (UTC)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('The date in YYYY-MM-DD format (UTC)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The reminder message')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('frequency')
                .setDescription('Frequency of the reminder (daily, weekly, custom)')
                .setRequired(true)
                .addChoices(
                    { name: 'Once', value: 'once' },
                    { name: 'Daily', value: 'daily' },
                    { name: 'Weekly', value: 'weekly' },
                    { name: 'Custom Interval', value: 'custom' },
                ))
        .addIntegerOption(option => 
            option.setName('interval')
                .setDescription('Custom interval in minutes (only if frequency is custom)')
                .setRequired(false))
        .addMentionableOption(option => 
            option.setName('mention')
                .setDescription('User or role to mention')
                .setRequired(false)),
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands('863134170283507744'),
            { body: commands.map(command => command.toJSON()) },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

// Bot ready
client.once('ready', () => {
    console.log('Bot is ready!');
    // Reschedule all reminders after the bot restarts
    reminders.forEach(reminder => scheduleReminder(reminder));
});

// Convert date and time to cron pattern
function convertToCronPattern(date, time, frequency, interval) {
    const [year, month, day] = date.split('-').map(num => parseInt(num));
    const [hour, minute] = time.split(':').map(num => parseInt(num));

    if (frequency === 'daily') {
        return `${minute} ${hour} * * *`;  // Daily at the same time
    } else if (frequency === 'weekly') {
        return `${minute} ${hour} * * 0`;  // Weekly at the same time (Sunday)
    } else if (frequency === 'custom' && interval) {
        return `*/${interval} * * * *`; // Custom interval in minutes
    } else {
        return `${minute} ${hour} ${day} ${month} *`; // One-time reminder
    }
}

// Save reminders to file
function saveReminders() {
    fs.writeFileSync(remindersFilePath, JSON.stringify(reminders, null, 2));
}

// Load reminders from file
function loadReminders() {
    if (fs.existsSync(remindersFilePath)) {
        return JSON.parse(fs.readFileSync(remindersFilePath, 'utf-8'));
    }
    return [];
}

// Schedule a reminder
function scheduleReminder(reminder) {
    const cronPattern = convertToCronPattern(reminder.date, reminder.time, reminder.frequency, reminder.interval);
    const reminderMessage = `${reminder.message} ${reminder.mention ? `<@${reminder.mention}>` : ''}`;
    
    new CronJob(cronPattern, () => {
        const channel = client.channels.cache.get(reminder.channelId);
        if (channel) {
            channel.send(reminderMessage);
        }
    }, null, true, 'UTC');
}

// Set a reminder
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'remind') {
        const time = interaction.options.getString('time');
        const date = interaction.options.getString('date');
        const message = interaction.options.getString('message');
        const frequency = interaction.options.getString('frequency');
        const interval = interaction.options.getInteger('interval');
        const mention = interaction.options.getMentionable('mention');
        const channelId = interaction.channel.id;

        const reminder = {
            time, date, message, frequency, interval, mention: mention?.id, channelId
        };

        // Save reminder to the reminders array and file
        reminders.push(reminder);
        saveReminders();

        // Schedule the reminder
        scheduleReminder(reminder);

        await interaction.reply(`Reminder set for ${date} ${time} UTC! Frequency: ${frequency}${interval ? ` every ${interval} minutes.` : ''}`);
    }
});

// Login to Discord
client.login(token);
