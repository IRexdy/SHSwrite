const playerIdDisplay = document.getElementById('player-id-display');
const nicknameInput = document.getElementById('nickname-input');
const changeNicknameButton = document.getElementById('change-nickname-button');
const roleButtons = document.querySelectorAll('.role-button');
const targetTextElement = document.getElementById('target-text');
const typedTextElement = document.getElementById('typed-text');
const virtualKeyboard = document.getElementById('virtual-keyboard');
const startGameButton = document.getElementById('start-game-button');
const resetGameButton = document.getElementById('reset-game-button');
const timerElement = document.getElementById('timer');
const gameStatusElement = document.getElementById('game-status');
const playerCursorsContainer = document.getElementById('player-cursors-container');
const blindOverlay = document.getElementById('blind-overlay');
const gameArea = document.getElementById('game-area');

const messageBox = document.getElementById('message-box');
const messageTitle = document.getElementById('message-title');
const messageContent = document.getElementById('message-content');
const closeMessageBox = document.getElementById('close-message-box');

let socket;
let myPlayerId = null;
let myRole = null;
let gameAreaRect;
const cursorColors = ['red-500', 'blue-500', 'green-500', 'orange-500', 'purple-500', 'pink-500'];

const keyboardLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'Backspace'],
    ['Space', 'Enter']
];

function createVirtualKeyboard() {
    virtualKeyboard.innerHTML = '';
    keyboardLayout.forEach(row => {
        row.forEach(key => {
            const button = document.createElement('button');
            button.classList.add('key-button');
            if (key === 'Space') {
                button.classList.add('space');
                button.textContent = 'Boşluk';
            } else if (key === 'Backspace') {
                button.classList.add('backspace');
                button.textContent = 'Geri';
            } else if (key === 'Enter') {
                button.classList.add('enter');
                button.textContent = 'Enter';
            } else {
                button.textContent = key.toUpperCase();
            }
            button.dataset.key = key;

            button.addEventListener('click', (event) => {
                // Göremeden rolündeki kişi artık klavyeyi kullanabilir.
                // Bu yüzden eski myRole === 'goremeden' kontrolü kaldırıldı.
                if (socket && myPlayerId) { // Tüm roller tuşa basabilir
                    if (myRole === 'konusmadan') {
                        showMessageBox("Uyarı", "Konuşamayan oyuncu metin yazabilir, ancak tuşları diğerlerine dikte etmek için imleci kullanmalıdır.");
                    }
                    socket.emit('key_press', { key: key });
                } else if (!socket) {
                    showMessageBox("Hata", "Sunucuya bağlanılamadı. Lütfen sayfayı yenileyin.");
                }
                event.preventDefault();
            });
            virtualKeyboard.appendChild(button);
        });
    });
}

function setupRoleSelection() {
    roleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedRole = button.id.replace('role-', '');
            if (myPlayerId) {
                myRole = selectedRole;
                socket.emit('role_select', { role: myRole });
                roleButtons.forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');

                applyRoleEffects(myRole);
            }
        });
    });
}

function applyRoleEffects(role) {
    if (role === 'goremeden') {
        blindOverlay.classList.add('active');
        document.body.classList.add('blind-mode');
        // startGameButton.disabled = false; // Bu kontrol zaten game_state'den geliyor
    } else {
        blindOverlay.classList.remove('active');
        document.body.classList.remove('blind-mode');
        // startGameButton.disabled = false;
    }
}

function getOrCreateCursor(id) {
    let cursor = document.getElementById(`cursor-${id}`);
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = `cursor-${id}`;
        cursor.classList.add('player-cursor');
        const colorIndex = Array.from(playerCursorsContainer.children).length % cursorColors.length;
        cursor.classList.add(`color-${colorIndex}`);

        const nicknameSpan = document.createElement('span');
        nicknameSpan.classList.add('nickname');
        cursor.appendChild(nicknameSpan);

        playerCursorsContainer.appendChild(cursor);
    }
    return cursor;
}

function updatePlayerCursors(playersInfo) {
    const existingPlayerIds = new Set();
    for (const id in playersInfo) {
        existingPlayerIds.add(id);
        const player = playersInfo[id];
        const cursor = getOrCreateCursor(id);

        cursor.style.transform = `translate(${player.x}px, ${player.y}px)`;

        const nicknameSpan = cursor.querySelector('.nickname');
        if (nicknameSpan) {
            nicknameSpan.textContent = `${player.nickname} (${player.role.charAt(0).toUpperCase()})`;
        }
    }

    Array.from(playerCursorsContainer.children).forEach(cursorElement => {
        const id = cursorElement.id.replace('cursor-', '');
        if (!existingPlayerIds.has(id)) {
            cursorElement.remove();
        }
    });
}

function updateGameAreaRect() {
    gameAreaRect = gameArea.getBoundingClientRect();
}

function showMessageBox(title, content) {
    messageTitle.textContent = title;
    messageContent.textContent = content;
    messageBox.classList.remove('hidden');
}

function hideMessageBox() {
    messageBox.classList.add('hidden');
}

function connectSocketIO() {
    socket = io();

    socket.on('connect', () => {
        console.log('Socket.IO bağlantısı kuruldu.');
        gameStatusElement.textContent = "Bağlandı, rol seçin.";
        startGameButton.disabled = false;
    });

    socket.on('player_id', (data) => {
        myPlayerId = data.id;
        playerIdDisplay.textContent = `Oyuncu ID: ${data.nickname}`;
        nicknameInput.value = data.nickname;
    });

    socket.on('game_state', (data) => {
        updatePlayerCursors(data.players_info);
        targetTextElement.textContent = data.target_text || 'Oyun başlamadı. Bir rol seçin ve oyunu başlatın.';
        typedTextElement.textContent = data.typed_text;
        timerElement.textContent = data.elapsed_time.toFixed(2);

        if (myPlayerId && data.players_info[myPlayerId]) {
            const myInfo = data.players_info[myPlayerId];
            myRole = myInfo.role;
            playerIdDisplay.textContent = `Oyuncu ID: ${myInfo.nickname}`;

            roleButtons.forEach(btn => {
                if (btn.id.replace('role-', '') === myRole) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            });
            applyRoleEffects(myRole);
        }

        if (data.game_started) {
            gameStatusElement.textContent = "Oyun Devam Ediyor...";
            startGameButton.disabled = true;
            resetGameButton.disabled = false;
        } else {
            gameStatusElement.textContent = "Oyun Başlamadı.";
            if (socket.connected) {
                startGameButton.disabled = false;
            }
            resetGameButton.disabled = false;
            if (data.target_text && data.typed_text === data.target_text && data.elapsed_time > 0) {
                 gameStatusElement.textContent = "Oyun Bitti!";
            }
        }
    });

    socket.on('game_over', (data) => {
        gameStatusElement.textContent = "Oyun Bitti!";
        startGameButton.disabled = false;
        resetGameButton.disabled = false;
        showMessageBox("Oyun Bitti!", `Tebrikler! Metni ${data.time_taken.toFixed(2)} saniyede yazdınız.`);
    });

    socket.on('message_box', (data) => {
        showMessageBox(data.title, data.content);
    });

    socket.on('disconnect', () => {
        console.log('Socket.IO bağlantısı kesildi.');
        gameStatusElement.textContent = "Bağlantı Kesildi. Yeniden bağlanılıyor...";
        startGameButton.disabled = true;
        resetGameButton.disabled = true;
        setTimeout(connectSocketIO, 3000);
    });

    socket.on('connect_error', (error) => {
        console.error('Socket.IO bağlantı hatası:', error);
        gameStatusElement.textContent = "Bağlantı Hatası. Yeniden bağlanılıyor...";
        startGameButton.disabled = true;
        resetGameButton.disabled = true;
    });
}

document.addEventListener('mousemove', (event) => {
    if (myPlayerId) {
        const x = event.clientX - gameAreaRect.left;
        const y = event.clientY - gameAreaRect.top;

        socket.emit('cursor_move', {
            x: x,
            y: y
        });
    }
});

startGameButton.addEventListener('click', (event) => {
    // Göremeden rolü için başlatma butonuna tıklama engeli kalmaya devam ediyor,
    // çünkü görme engeli olan birisi butonu efektif olarak kullanamaz.
    if (myRole === 'goremeden') {
        showMessageBox("Uyarı", "Göremeden rolündeyken oyunu başlatamazsınız. Başka bir oyuncunun başlatması gerekiyor.");
        event.preventDefault();
        return;
    }
    if (!myRole) {
        showMessageBox("Rol Seçilmedi", "Lütfen oyunu başlatmadan önce bir rol seçin (Göremeden, Duymadan, Konuşmadan).");
        event.preventDefault();
        return;
    }
    socket.emit('start_game');
    event.preventDefault();
});

resetGameButton.addEventListener('click', (event) => {
    socket.emit('reset_game');
    myRole = null;
    roleButtons.forEach(btn => btn.classList.remove('selected'));
    applyRoleEffects(null);
    event.preventDefault();
});

closeMessageBox.addEventListener('click', hideMessageBox);

changeNicknameButton.addEventListener('click', (event) => {
    const newNickname = nicknameInput.value.trim();
    if (newNickname) {
        socket.emit('change_nickname', { nickname: newNickname });
    } else {
        showMessageBox("Uyarı", "Takma ad boş olamaz!");
    }
    event.preventDefault();
});

window.addEventListener('resize', updateGameAreaRect);
window.addEventListener('scroll', updateGameAreaRect);

document.addEventListener('DOMContentLoaded', () => {
    createVirtualKeyboard();
    setupRoleSelection();
    connectSocketIO();
    updateGameAreaRect();
});
