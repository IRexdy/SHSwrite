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
const gameArea = document.getElementById('game-area'); // gameArea elementini doğru şekilde alıyoruz

// Mesaj Kutusu Elementleri
const messageBox = document.getElementById('message-box');
const messageTitle = document.getElementById('message-title');
const messageContent = document.getElementById('message-content');
const closeMessageBox = document.getElementById('close-message-box');

// --- Oyun Durumu Değişkenleri ---
let socket;
let myPlayerId = null;
let myRole = null;
let gameAreaRect; // gameArea'nın boyutları için
const cursorColors = ['red-500', 'blue-500', 'green-500', 'orange-500', 'purple-500', 'pink-500'];

let isGameStarted = false; // Sunucudan gelen bilgiyle güncellenecek

// Sanal klavye için sabit düzen
const keyboardLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'Backspace'],
    ['Space', 'Enter']
];

// --- Yardımcı Fonksiyonlar ---

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
            button.addEventListener('click', (event) => {
                event.preventDefault(); // Varsayılan davranışı engelle (örneğin form submit)
                // Göremeden rolü hariç diğer roller klavye kullanamaz
                if (socket && myPlayerId && myRole === 'goremeden') {
                    socket.emit('key_press', { key: key });
                    console.log(`CLIENT: Emitting key_press for goremeden: ${key}`);
                } else if (myRole !== 'goremeden') {
                    showMessageBox("Uyarı", "Bu rolde metin yazamazsınız. Göremeden rolündeki oyuncuyu yönlendirmeniz gerekiyor.");
                    console.log(`CLIENT: Not allowed to type for role: ${myRole}`);
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
    console.log(`CLIENT: Applying effects for role: ${role}`);

    // Tüm efektleri sıfırla
    blindOverlay.classList.remove('active');
    document.body.classList.remove('blind-mode');
    targetTextElement.classList.remove('target-text-blackout');
    virtualKeyboard.classList.remove('keyboard-blackout');
    // Klavye tuşlarının renklerini de sıfırla (eğer keyboard-blackout tarafından değiştirildiyse)
    document.querySelectorAll('.key-button').forEach(btn => {
        btn.style.backgroundColor = ''; // CSS'deki varsayılanına döner
        btn.style.color = '';
        btn.style.borderColor = '';
    });


    if (role === 'goremeden') {
        // Göremeden: Tüm ekran bulanık ve karartılmış (body.blind-mode), klavye simsiyah (keyboard-blackout)
        document.body.classList.add('blind-mode'); // Applies blur and brightness to body
        virtualKeyboard.classList.add('keyboard-blackout'); // Make keyboard black
        // blindOverlay burada aktif değil çünkü klavye ile etkileşim olmalı
        console.log("CLIENT: Blind mode (blur) activated for body, keyboard blacked out.");
    } else if (role === 'duymadan') {
        // Duymadan: Sadece hedef metin alanı siyah
        targetTextElement.classList.add('target-text-blackout'); // Make target text black
        console.log("CLIENT: Target text blacked out for Duymadan role.");
    }
    // Konuşmadan rolü veya rol seçilmemişse ek efekt yok.
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
        const prevGameStarted = isGameStarted;
        isGameStarted = data.game_started;

        updatePlayerCursors(data.players_info);
        typedTextElement.textContent = data.typed_text;
        timerElement.textContent = data.elapsed_time.toFixed(2);

        // Hedef metni her zaman sunucudan gelen haliyle ayarla, görsel efekti CSS ile kontrol et
        targetTextElement.textContent = data.target_text || 'Oyun başlamadı. Bir rol seçin ve oyunu başlatın.';

        if (myPlayerId && data.players_info[myPlayerId]) {
            const myInfo = data.players_info[myPlayerId];
            myRole = myInfo.role; // Rolü her zaman sunucudan gelen bilgiyle güncelle
            applyRoleEffects(myRole); // Rol efektlerini her zaman uygula (bu, Duymadan için CSS sınıfını ekleyecek)
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

        if (isGameStarted) {
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
    createVirtualKeyboard(); // Sıfırlarken klavyeyi yeniden oluştur (sabit düzen)
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
    createVirtualKeyboard(); // Klavyeyi oluştur (sabit düzen)
    setupRoleSelection(); // Rol seçim butonlarını hazırla
    connectSocketIO(); // Socket.IO bağlantısını başlat
    updateGameAreaRect(); // Oyun alanı dikdörtgenini ilk başta ayarla
});
