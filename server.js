const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Настройка CORS для продакшена
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============================================================
// 1. ИСТОРИЯ СООБЩЕНИЙ
// ============================================================
app.get('/history', async (req, res) => {
    const { user } = req.query;
    const currentUser = req.headers['x-username'];

    if (!user || !currentUser) {
        return res.status(400).json({ error: 'Не указаны пользователи' });
    }

    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('created_at')
        .eq('username', currentUser)
        .single();

    if (userError) {
        console.error('Ошибка при получении даты регистрации:', userError);
        return res.status(500).json({ error: 'Не удалось получить данные пользователя' });
    }

    const userCreatedAt = userData.created_at;

    let query = supabase.from('messages').select('*');

    if (user === 'general') {
        query = query
            .eq('to_user', 'general')
            .gte('created_at', userCreatedAt);
    } else {
        query = query
            .or(`and(from_user.eq.${currentUser},to_user.eq.${user}),and(from_user.eq.${user},to_user.eq.${currentUser})`)
            .gte('created_at', userCreatedAt);
    }

    const { data: messages, error } = await query
        .order('created_at', { ascending: true })
        .limit(50);

    if (error) {
        console.error('Ошибка при загрузке истории:', error);
        return res.status(500).json({ error: 'Не удалось загрузить историю' });
    }

    res.json(messages);
});

// ============================================================
// 2. РЕГИСТРАЦИЯ
// ============================================================
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { error } = await supabase
        .from('users')
        .insert([{ username, password: hashedPassword }]);

    if (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Такой логин уже существует' });
        }
        return res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }

    res.json({ message: 'Пользователь создан!', username });
});

// ============================================================
// 3. ЛОГИН
// ============================================================
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username);

    if (error) return res.status(500).json({ error: 'Ошибка сервера' });
    if (users.length === 0) {
        return res.status(400).json({ error: 'Пользователь не найден' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
        return res.status(400).json({ error: 'Неверный пароль' });
    }

    res.json({ message: 'Успешный вход!', username: user.username });
});

// ============================================================
// 4. СОКЕТЫ
// ============================================================
const activeUsers = {};

io.on('connection', (socket) => {
    console.log('🔌 Новый пользователь подключился:', socket.id);

    socket.on('setUsername', (username) => {
        activeUsers[username] = socket.id;
        socket.username = username;
        io.emit('activeUsers', Object.keys(activeUsers));
        console.log(`✅ Пользователь ${username} активен`);
    });

    socket.on('sendMessage', async ({ toUser, text }) => {
        if (!socket.username) return;
        const fromUser = socket.username;

        const { error } = await supabase
            .from('messages')
            .insert([{ from_user: fromUser, to_user: toUser, text }]);

        if (error) {
            console.error('❌ Ошибка при сохранении сообщения:', error);
            return;
        }

        const receiverSocketId = activeUsers[toUser];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receiveMessage', { from: fromUser, to: toUser, text });
        }

        socket.emit('receiveMessage', { from: fromUser, to: toUser, text });
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            delete activeUsers[socket.username];
            io.emit('activeUsers', Object.keys(activeUsers));
            console.log(`❌ Пользователь ${socket.username} отключился`);
        }
    });
});

// ============================================================
// 5. ЗАПУСК
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер Tessum запущен на http://localhost:${PORT}`);
});