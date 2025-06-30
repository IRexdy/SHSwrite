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

// Sanal klavye için sabit düzen
const keyboardLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'Backspace'],
    ['Space', 'Enter']
];

// --- Yardımcı Fonksiyonlar ---

/**
 * Belirtilen uzunlukta rastgele harflerden oluşan bir dize oluşturur.
 * @param {number} length - Oluşturulacak dizenin uzunluğu.
 * @returns {string} - Rastgele harflerden oluşan dize.
 */
function generateRandomLetters(length) {
    const characters = 'abcçdefgğhıijklmnoöprsştuüvyz '; // Türkçe harfler ve boşluk
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * Sanal klavyeyi oluşturur ve DOM'a ekler.
 * Harf tuşlarının yerini rastgele karıştırmaz, sabit sırada tutar.
 */
function createVirtualKeyboard() {
    virtualKeyboard.innerHTML = ''; // Mevcut klavyeyi temizle
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
                button.textContent = key.toUpperCase(); // Tuş metni BÜYÜK HARF olarak gösterilecek
            }
            button.dataset.key = key; // Tuş değerini data özelliğine KÜÇÜK HARF olarak sakla

            // Tuş tıklama olay dinleyicisi
            button.addEventListener('click', () => {
                // Göremeden rolü hariç diğer roller klavye kullanamaz
                if (socket && myPlayerId && myRole === 'goremeden') {
                    socket.emit('key_press', { key: key });
                } else if (myRole !== 'goremeden') {
                    showMessageBox("Uyarı", "Bu rolde metin yazamazsınız. Göremeden rolündeki oyuncuyu yönlendirmeniz gerekiyor.");
                } else if (!socket) {
                    showMessageBox("Hata", "Sunucuya bağlanılamadı. Lütfen sayfayı yenileyin.");
                }
            });
            virtualKeyboard.appendChild(button);
        });
    });
    console.log("CLIENT: Virtual keyboard re-created (fixed layout).");
}

/**
 * Oyuncu rollerini seçme butonlarına olay dinleyicileri ekler.
 */
function setupRoleSelection() {
    roleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const selectedRole = button.id.replace('role-', ''); // "role-goremeden" -> "goremeden"
            if (myPlayerId) {
                myRole = selectedRole; // Kendi rolümüzü güncelle
                socket.emit('role_select', { role: myRole });
                // Seçili rolü görsel olarak vurgula
                roleButtons.forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');

                // Role özel efektleri uygula
                applyRoleEffects(myRole);
            }
        });
    });
}

/**
 * Seçilen role göre arayüz efektlerini uygular.
 * @param {string} role - Seçilen oyuncu rolü ('goremeden', 'duymadan', 'konusmadan').
 */
function applyRoleEffects(role) {
    if (role === 'goremeden') {
        blindOverlay.classList.add('active'); // Göremeden için karartma katmanını etkinleştir
        document.body.classList.add('blind-mode'); // Genel bulanıklık ve karartma
        startGameButton.disabled = false;
    } else {
        blindOverlay.classList.remove('active');
        document.body.classList.remove('blind-mode');
    }

    // Diğer roller için başlat butonu durumu
    // Sadece "Göremeden" rolü yazabildiği için, oyunu başlatma yetkisi diğer rollerde olmalı.
    // Bu mantık server tarafından da kontrol ediliyor.
    startGameButton.disabled = false; // Herkes oyunu başlatabilir, ancak server rol kontrolü yapacak.
}

/**
 * Belirtilen ID'ye sahip bir imleç elementi döndürür, yoksa oluşturur.
 * Nickname'i de ekler/günceller.
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

        const nicknameSpan = document.createElement('span'); // Nickname için span
        nicknameSpan.classList.add('nickname');
        cursor.appendChild(nicknameSpan); // İmlece nickname span'ini ekle

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

        // İmleç pozisyonlarını ayarla
        cursor.style.transform = `translate(${player.x}px, ${player.y}px)`;

        // Nickname'i güncelle
        const nicknameSpan = cursor.querySelector('.nickname');
        if (nicknameSpan) {
            nicknameSpan.textContent = `${player.nickname} (${player.role.charAt(0).toUpperCase()})`; // Nickname ve rolün baş harfi
        }
    }

    // Artık bağlı olmayan imleçleri kaldır
    Array.from(playerCursorsContainer.children).forEach(cursorElement => {
        const id = cursorElement.id.replace('cursor-', '');
        if (!existingPlayerIds.has(id)) {
            cursorElement.remove();
        }
    });
}

/**
 * Tarayıcı penceresinin boyutları veya kaydırma çubukları değiştiğinde oyun alanı dikdörtgenini günceller.
 */
function updateGameAreaRect() {
    // gameArea elementinin boyutlarını ve konumunu alıyoruz
    const gameArea = document.getElementById('game-area');
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
}

/**
 * Mesaj kutusunu gizler.
 */
function hideMessageBox() {
    messageBox.classList.add('hidden');
}

// --- Socket.IO İletişimi ---

/**
 * Socket.IO bağlantısını başlatır.
 */
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
        typedTextElement.textContent = data.typed_text;
        timerElement.textContent = data.elapsed_time.toFixed(2);

        // Hedef metni role göre göster
        if (myPlayerId && data.players_info[myPlayerId] && data.players_info[myPlayerId].role === 'duymadan') {
            // Eğer oyuncu "Duymadan" ise, hedef metnin uzunluğu kadar rastgele harf göster
            if (data.target_text) {
                targetTextElement.textContent = generateRandomLetters(data.target_text.length);
            } else {
                targetTextElement.textContent = 'Oyun başlamadı. Bir rol seçin ve oyunu başlatın.';
            }
        } else {
            // Diğer roller (Göremeden, Konuşmadan veya rol seçilmemişse) hedef metni olduğu gibi görür
            targetTextElement.textContent = data.target_text || 'Oyun başlamadı. Bir rol seçin ve oyunu başlatın.';
        }

        if (myPlayerId && data.players_info[myPlayerId]) {
            const myInfo = data.players_info[myPlayerId];
            myRole = myInfo.role;
            playerIdDisplay.textContent = `Oyuncu ID: ${myInfo.nickname}`;
            nicknameInput.value = myInfo.nickname;

            roleButtons.forEach(btn => {
                if (btn.id.replace('role-', '') === myRole) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            });
        }

        if (data.game_started) {
            gameStatusElement.textContent = "Oyun Devam Ediyor...";
            startGameButton.disabled = true;
            resetGameButton.disabled = false;
        } else {
            gameStatusElement.textContent = "Oyun Başlamadı.";
            startGameButton.disabled = false;
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
        setTimeout(connectSocketIO, 3000);
    });

    socket.on('connect_error', (error) => {
        console.error('Socket.IO bağlantı hatası:', error);
        gameStatusElement.textContent = "Bağlantı Hatası. Yeniden bağlanılıyor...";
    });
}

// --- Olay Dinleyicileri ---

// Fare hareketi olay dinleyicisi
document.addEventListener('mousemove', (event) => {
    if (myPlayerId) {
        // İmleç konumunu oyun alanına göre ayarla
        const x = event.clientX - gameAreaRect.left;
        const y = event.clientY - gameAreaRect.top;

        // Sadece oyun alanı içindeki hareketleri gönder
        // Bu kontrol, imlecin oyun alanı dışına çıkmasını engeller
        if (x >= 0 && x <= gameAreaRect.width && y >= 0 && y <= gameAreaRect.height) {
            socket.emit('cursor_move', {
                x: x,
                y: y
            });
        }
    }
});

// Oyunu başlat butonu
startGameButton.addEventListener('click', () => {
    if (!myRole) {
        showMessageBox("Rol Seçilmedi", "Lütfen oyunu başlatmadan önce bir rol seçin (Göremeden, Duymadan, Konuşmadan).");
        return;
    }
    // Sadece "Göremeden" rolündeki oyuncu oyunu başlatamaz.
    // Diğer roller (Duymadan ve Konuşmadan) oyunu başlatabilir.
    if (myRole === 'goremeden') {
        showMessageBox("Uyarı", "Göremeden rolündeyken oyunu başlatamazsınız. Başka bir oyuncunun başlatması gerekiyor.");
        return;
    }
    socket.emit('start_game');
});

// Oyunu sıfırla butonu
resetGameButton.addEventListener('click', () => {
    socket.emit('reset_game');
    myRole = null;
    roleButtons.forEach(btn => btn.classList.remove('selected'));
    applyRoleEffects(null);
    // Nickname input'unu ve görüntülenen player ID'yi sıfırlama,
    // çünkü server'dan yeni default nickname gelecek
});

// Mesaj kutusunu kapatma butonu
closeMessageBox.addEventListener('click', hideMessageBox);

// Nickname değiştirme butonu olay dinleyicisi
changeNicknameButton.addEventListener('click', () => {
    const newNickname = nicknameInput.value.trim();
    if (newNickname) {
        socket.emit('change_nickname', { nickname: newNickname });
    } else {
        showMessageBox("Uyarı", "Takma ad boş olamaz!");
    }
});

// Pencere yeniden boyutlandırıldığında veya kaydırıldığında oyun alanı dikdörtgenini güncelle
window.addEventListener('resize', updateGameAreaRect);
window.addEventListener('scroll', updateGameAreaRect);

// --- Başlangıç Fonksiyonları ---
document.addEventListener('DOMContentLoaded', () => {
    createVirtualKeyboard(); // Klavyeyi oluştur
    setupRoleSelection(); // Rol seçim butonlarını hazırla
    connectSocketIO(); // Socket.IO bağlantısını başlat
    updateGameAreaRect(); // Oyun alanı dikdörtgenini ilk başta ayarla
});
