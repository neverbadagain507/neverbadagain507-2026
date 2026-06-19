// ============================================================
// ПОДКЛЮЧЕНИЕ К СЕРВЕРУ (работает и локально, и на Render)
// ============================================================

// Определяем адрес сервера автоматически
const SERVER_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000'   // локальный запуск
    : window.location.origin;    // продакшен (Render)

const socket = io(SERVER_URL);

// ============================================================
// DOM-ЭЛЕМЕНТЫ
// ============================================================
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const toggleModeLink = document.getElementById('toggleMode');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const logoutBtn = document.getElementById('logoutBtn');
const contactList = document.getElementById('contactList');
const currentChatName = document.getElementById('currentChatName');
const onlineStatus = document.getElementById('onlineStatus');

// ============================================================
// СОСТОЯНИЕ
// ============================================================
let currentUser = null;
let isLoginMode = true;

// ============================================================
// ФУНКЦИИ
// ============================================================
function showError(msg) {
    loginError.textContent = msg;
    setTimeout(() => loginError.textContent = '', 3000);
}

function showScreen(screen) {
    loginScreen.classList.toggle('active', screen === 'login');
    chatScreen.classList.toggle('active', screen === 'chat');
}

function addMessage(from, text) {
    const div = document.createElement('div');
    div.className = `message ${from === currentUser ? 'self' : 'other'}`;

    if (from !== currentUser) {
        const sender = document.createElement('div');
        sender.className = 'sender';
        sender.textContent = from;
        div.appendChild(sender);
    }

    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    div.appendChild(textSpan);

    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ============================================================
// ЗАГРУЗКА ИСТОРИИ
// ============================================================
async function loadHistory(contactName) {
    if (!currentUser || !contactName) return;

    console.log(`🔄 Загружаем историю с ${contactName}...`);

    try {
        const response = await fetch(`${SERVER_URL}/history?user=${contactName}`, {
            headers: { 'x-username': currentUser }
        });

        const messages = await response.json();

        if (!response.ok) {
            console.error('❌ Ошибка:', messages.error);
            return;
        }

        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'message other';
            emptyMsg.innerHTML = `<div class="sender">💬</div>Нет сообщений. Напиши что-нибудь!`;
            messagesContainer.appendChild(emptyMsg);
        } else {
            messages.forEach(msg => {
                addMessage(msg.from_user, msg.text);
            });
        }

        console.log(`✅ Загружено ${messages.length} сообщений с ${contactName}`);
    } catch (err) {
        console.error('❌ Не удалось загрузить историю:', err);
    }
}

// ============================================================
// ВХОД / РЕГИСТРАЦИЯ
// ============================================================
async function handleAuth() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        showError('Заполни логин и пароль');
        return;
    }

    const endpoint = isLoginMode ? '/login' : '/register';

    try {
        const response = await fetch(`${SERVER_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showError(data.error || 'Ошибка');
            return;
        }

        currentUser = username;
        socket.emit('setUsername', username);
        showScreen('chat');

        currentChatName.textContent = 'Общий чат';
        onlineStatus.textContent = 'онлайн';
        messagesContainer.innerHTML = '';
        await loadHistory('general');

        messageInput.value = '';
        loginError.textContent = '';
    } catch (err) {
        showError('Не удалось подключиться к серверу');
        console.error(err);
    }
}

// ============================================================
// ОБРАБОТЧИКИ
// ============================================================
toggleModeLink.addEventListener('click', () => {
    isLoginMode = !isLoginMode;

    if (isLoginMode) {
        toggleModeLink.innerHTML = 'Нет аккаунта? <span>Зарегистрируйся</span>';
        loginBtn.textContent = 'Войти';
        registerBtn.style.display = 'none';
    } else {
        toggleModeLink.innerHTML = 'Уже есть аккаунт? <span>Войди</span>';
        loginBtn.textContent = 'Создать аккаунт';
        registerBtn.style.display = 'none';
    }

    loginError.textContent = '';
});

loginBtn.addEventListener('click', handleAuth);
registerBtn.addEventListener('click', handleAuth);

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    const toUser = currentChatName.textContent;

    socket.emit('sendMessage', { toUser, text });
    messageInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

logoutBtn.addEventListener('click', () => {
    currentUser = null;
    showScreen('login');
    messagesContainer.innerHTML = '';
    usernameInput.value = '';
    passwordInput.value = '';
});

// ============================================================
// КЛИК ПО КОНТАКТАМ
// ============================================================
contactList.addEventListener('click', (e) => {
    const item = e.target.closest('.contact-item');
    if (!item) return;

    const user = item.dataset.user;
    if (user) {
        currentChatName.textContent = user;
        onlineStatus.textContent = user === 'general' ? 'онлайн' : 'в сети';

        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        loadHistory(user);
    }
});

// ============================================================
// ПОЛУЧЕНИЕ СООБЩЕНИЙ
// ============================================================
socket.on('receiveMessage', ({ from, to, text }) => {
    const currentChat = currentChatName.textContent;

    if (currentChat === 'general' && to === 'general') {
        addMessage(from, text);
    } else if (currentChat !== 'general' && (from === currentChat || to === currentChat)) {
        addMessage(from, text);
    }
});

// ============================================================
// ОНЛАЙН ПОЛЬЗОВАТЕЛИ
// ============================================================
socket.on('activeUsers', (users) => {
    contactList.innerHTML = `
        <div class="contact-item active" data-user="general">
            <div class="avatar">📢</div>
            <div class="contact-info">
                <div class="contact-name">Общий чат</div>
                <div class="contact-preview">Пиши сюда...</div>
            </div>
        </div>
    `;

    users.forEach(user => {
        if (user === currentUser) return;

        const div = document.createElement('div');
        div.className = 'contact-item';
        div.dataset.user = user;
        div.innerHTML = `
            <div class="avatar">👤</div>
            <div class="contact-info">
                <div class="contact-name">${user}</div>
                <div class="contact-preview">Онлайн</div>
            </div>
        `;
        contactList.appendChild(div);
    });
});

// ============================================================
// СТАРТ
// ============================================================
showScreen('login');
registerBtn.style.display = 'none';
console.log('🚀 Tessum frontend загружен!');
console.log(`🔗 Сервер: ${SERVER_URL}`);