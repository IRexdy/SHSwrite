// static/script.js

// --- DOM Elementleri ---
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

// Mesaj Kutusu Elementleri
const messageBox = document.getElementById('message-box');
const messageTitle = document.getElementById('message-title');
const messageContent = document.getElementById('message-content');
const closeMessageBox = document.getElementById('close-message-box');

// --- Oyun Durumu Değişkenleri ---
let socket;
let myPlayerId = null;
let myRole = null;
let gameAreaRect;
const cursorColors = ['red-500', 'blue-500', 'green-500', 'orange-500', 'purple-500', 'pink-500'];

let isGameStarted = false; // Sunucudan gelen bilgiyle güncellenecek

// --- Sanal Klavye Tuşları ---
// Tüm harf tuşları (Türkçe karakterler dahil)
const allLetterKeys = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü',
                       'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i',
                       'z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç'];

// Sabit konumdaki özel tuşlar
const fixedSpecialKeys = [
    { key: 'Backspace', text: 'Geri', class: 'backspace' },
    { key: 'Space', text: 'Boşluk', class: 'space' },
    { key: 'Enter', text: 'Enter', class: 'enter' }
];

// --- Yardımcı Fonksiyonlar ---

/**
 * Sanal klavyeyi oluşturur ve DOM'a ekler.
 * Harf tuşlarının yerini rastgele karıştırır.
 */
function createVirtualKeyboard() {
    virtualKeyboard.innerHTML = ''; // Mevcut klavyeyi temizle

    // Harf tuşlarını karıştır
    const shuffledLetterKeys = [...allLetterKeys].sort(() => Math.random() - 0.5);

    // Karıştırılmış harf tuşlarını ekle
    shuffledLetterKeys.forEach(key => {
        const button = document.createElement('button');
        button.classList.add('key-button');
        button.textContent = key.toUpperCase(); // Tuş metni büyük harf olsun
        button.dataset.key = key; // Tuş değerini data özelliğine sakla
        button.addEventListener('click', handleKeyPress); // Ortak olay dinleyici
        virtualKeyboard.appendChild(button);
    });

    // Sabit özel tuşları ekle
    fixedSpecialKeys.forEach(item => {
        const button = document.createElement('button');
        button.classList.add('key-button', item.class);
        button.textContent = item.text;
        button.dataset.key = item.key;
        button.addEventListener('click', handleKeyPress); // Ortak olay dinleyici
        virtualKeyboard.appendChild(button);
    });
}

/**
 * Klavye tuş basımı olayını işler.
 * @param {Event} event - Tıklama olayı.
 */
function handleKeyPress(event) {
    event.preventDefault();
    const key = event.currentTarget.dataset.key; // data-key özelliğinden tuş değerini al
    console.log(`CLIENT: Key '${key}' clicked. My Role: ${myRole}, Game Started: ${isGameStarted}`);

    if (!socket || !myPlayerId) {
        showMessageBox("Hata", "Sunucuya bağlanılamadı veya oyuncu ID'si yok. Lütfen sayfayı yenileyin.");
        return;
    }

    if (!isGameStarted) {
        showMessageBox("Uyarı", "Oyun henüz başlamadı. Oyunu başlatmak için 'Oyunu Başlat' butonuna tıklamalısınız.");
        return;
    }

    if (myRole === 'goremeden') {
        socket.emit('key_press', { key: key });
        console.log(`CLIENT: Emitting key_press for goremeden: ${key}`);
    } else {
        showMessageBox("Uyarı", "Bu rolde metin yazamazsınız. Göremeden rolündeki oyuncuyu yönlendirmeniz gerekiyor.");
        console.log(`CLIENT: Not allowed to type for role: ${myRole}`);
    }
}

/**
 * Oyuncu rollerini seçme butonlarına olay dinleyicileri ekler.
 */
function setupRoleSelection() {
    roleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedRole = button.id.replace('role-', '');
            if (myPlayerId) {
                myRole = selectedRole; // Rolü istemci tarafında hemen ayarla
                socket.emit('role_select', { role: myRole });
                console.log(`CLIENT: Role selected: ${myRole} for player ${myPlayerId}`);
                roleButtons.forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');

                applyRoleEffects(myRole); // Efektleri hemen uygula
            }
        });
    });
}

/**
 * Seçilen role göre arayüz efektlerini uygular.
 * @param {string} role - Seçilen oyuncu rolü ('goremeden', 'duymadan', 'konusmadan').
 */
function applyRoleEffects(role) {
    console.log(`CLIENT: Applying effects for role: ${role}`);
    if (role === 'goremeden') {
        blindOverlay.classList.add('active');
        document.body.classList.add('blind-mode');
        console.log("CLIENT: Blind mode activated.");
    } else {
        blindOverlay.classList.remove('active');
        document.body.classList.remove('blind-mode');
        console.log("CLIENT: Blind mode deactivated.");
    }
}

/**
 * Belirtilen ID'ye sahip bir imleç elementi döndürür, yoksa oluşturur.
 * Nickname'i de içeren bir span elementi ekler.
 * @param {string} id - Oyuncu ID'si.
 * @returns {HTMLElement} - İmleç div elementi.
 */
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

/**
 * Tüm oyuncu imleçlerinin konumunu ve takma adlarını günceller.
 * @param {Object} playersInfo - {player_id: {x, y, nickname, role}} formatında oyuncu bilgileri.
 */
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

/**
 * Tarayıcı penceresinin boyutları veya kaydırma çubukları değiştiğinde oyun alanı dikdörtgenini günceller.
 * Bu, imleç konumlarını doğru hesaplamak için gereklidir.
 */
function updateGameAreaRect() {
    gameAreaRect = gameArea.getBoundingClientRect();
}

/**
 * Mesaj kutusunu gösterir.
 * @param {string} title - Mesaj kutusunun başlığı.
 * @param {string} content - Mesaj kutusunun içeriği.
 */
function showMessageBox(title, content) {
    messageTitle.textContent = title;
    messageContent.textContent = content;
    messageBox.classList.remove('hidden');
    console.log(`CLIENT: Message Box Shown - Title: ${title}, Content: ${content}`);
}

/**
 * Mesaj kutusunu gizler.
 */
function hideMessageBox() {
    messageBox.classList.add('hidden');
    console.log("CLIENT: Message Box Hidden.");
}

// --- Socket.IO İletişimi ---

/**
 * Socket.IO bağlantısını başlatır ve olay dinleyicilerini kurar.
 */
function connectSocketIO() {
    socket = io();

    socket.on('connect', () => {
        console.log('CLIENT: Socket.IO bağlantısı kuruldu.');
        gameStatusElement.textContent = "Bağlandı, rol seçin.";
        startGameButton.disabled = false;
    });

    socket.on('player_id', (data) => {
        myPlayerId = data.id;
        playerIdDisplay.textContent = `Oyuncu ID: ${data.nickname}`;
        nicknameInput.value = data.nickname;
        console.log(`CLIENT: My Player ID: ${myPlayerId}, Nickname: ${data.nickname}`);
    });

    socket.on('game_state', (data) => {
        isGameStarted = data.game_started;
        console.log(`CLIENT: Game State Updated. Game Started: ${isGameStarted}, My Role (before update): ${myRole}`);

        updatePlayerCursors(data.players_info);
        targetTextElement.textContent = data.target_text || 'Oyun başlamadı. Bir rol seçin ve oyunu başlatın.';
        typedTextElement.textContent = data.typed_text;
        timerElement.textContent = data.elapsed_time.toFixed(2);

        if (myPlayerId && data.players_info[myPlayerId]) {
            const myInfo = data.players_info[myPlayerId];
            // Rolü her zaman sunucudan gelen bilgiyle güncelle
            myRole = myInfo.role;
            // Rol efektlerini her zaman uygula, böylece görsel durum sunucuyla senkronize kalır
            applyRoleEffects(myRole);
            playerIdDisplay.textContent = `Oyuncu ID: ${myInfo.nickname}`;
        }
        console.log(`CLIENT: Game State Updated. My Role (after update): ${myRole}`);


        if (data.game_started) {
            gameStatusElement.textContent = "Oyun Devam Ediyor...";
            startGameButton.disabled = true;
            resetGameButton.disabled = false;
            // Oyun başladığında klavyeyi yeniden oluştur (harfleri karıştırmak için)
            createVirtualKeyboard();
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
        console.log(`CLIENT: Game Over! Time: ${data.time_taken.toFixed(2)}s`);
        gameStatusElement.textContent = "Oyun Bitti!";
        startGameButton.disabled = false;
        resetGameButton.disabled = false;
        showMessageBox("Oyun Bitti!", `Tebrikler! Metni ${data.time_taken.toFixed(2)} saniyede yazdınız.`);
    });

    socket.on('message_box', (data) => {
        showMessageBox(data.title, data.content);
    });

    socket.on('disconnect', () => {
        console.log('CLIENT: Socket.IO bağlantısı kesildi.');
        gameStatusElement.textContent = "Bağlantı Kesildi. Yeniden bağlanılıyor...";
        startGameButton.disabled = true;
        resetGameButton.disabled = true;
        setTimeout(connectSocketIO, 3000);
    });

    socket.on('connect_error', (error) => {
        console.error('CLIENT: Socket.IO bağlantı hatası:', error);
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
    event.preventDefault();
    console.log(`CLIENT: Start Game button clicked. My Role: ${myRole}`);

    if (myRole === 'goremeden') {
        showMessageBox("Uyarı", "Göremeden rolündeyken oyunu başlatamazsınız. Başka bir oyuncunun başlatması gerekiyor.");
        return;
    }
    if (!myRole) {
        showMessageBox("Rol Seçilmedi", "Lütfen oyunu başlatmadan önce bir rol seçin (Göremeden, Duymadan, Konuşmadan).");
        return;
    }
    socket.emit('start_game');
});

resetGameButton.addEventListener('click', (event) => {
    event.preventDefault();
    console.log("CLIENT: Reset Game button clicked.");
    socket.emit('reset_game');
    myRole = null;
    roleButtons.forEach(btn => btn.classList.remove('selected'));
    applyRoleEffects(null); // Efektleri kaldır
    createVirtualKeyboard(); // Klavyeyi sıfırlarken de karıştır
});

closeMessageBox.addEventListener('click', hideMessageBox);

changeNicknameButton.addEventListener('click', (event) => {
    event.preventDefault();
    const newNickname = nicknameInput.value.trim();
    if (newNickname) {
        socket.emit('change_nickname', { nickname: newNickname });
        console.log(`CLIENT: Nickname change requested: ${newNickname}`);
    } else {
        showMessageBox("Uyarı", "Takma ad boş olamaz!");
    }
});

window.addEventListener('resize', updateGameAreaRect);
window.addEventListener('scroll', updateGameAreaRect);

document.addEventListener('DOMContentLoaded', () => {
    createVirtualKeyboard(); // Sayfa yüklendiğinde klavyeyi oluştur
    setupRoleSelection();
    connectSocketIO();
    updateGameAreaRect();
});
