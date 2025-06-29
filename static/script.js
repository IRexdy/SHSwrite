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
const gameArea = document.getElementById('game-area'); // Oyun alanının tamamı için

// Mesaj Kutusu Elementleri
const messageBox = document.getElementById('message-box');
const messageTitle = document.getElementById('message-title');
const messageContent = document.getElementById('message-content');
const closeMessageBox = document.getElementById('close-message-box');

// --- Oyun Durumu Değişkenleri ---
let socket; // Socket.IO bağlantısı
let myPlayerId = null; // Bu istemcinin kendi oyuncu ID'si
let myRole = null; // Bu istemcinin kendi rolü
let gameAreaRect; // Oyun alanının boyutları ve konumu (imleç hesaplamaları için)
const cursorColors = ['red-500', 'blue-500', 'green-500', 'orange-500', 'purple-500', 'pink-500']; // İmleç renkleri

// --- Sanal Klavye Tuşları ---
const keyboardLayout = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'Backspace'],
    ['Space', 'Enter']
];

// --- Yardımcı Fonksiyonlar ---

/**
 * Sanal klavyeyi oluşturur ve DOM'a ekler.
 * Her tuşa tıklama olayı dinleyicisi ekler.
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
                button.textContent = key.toUpperCase(); // Tuş metni
            }
            button.dataset.key = key; // Tuş değerini data özelliğine sakla

            // Tuş tıklama olay dinleyicisi
            button.addEventListener('click', (event) => {
                // Kural: Sadece 'goremeden' rolündeki oyuncu yazabilir
                if (myRole === 'goremeden') {
                    if (socket && myPlayerId) {
                        socket.emit('key_press', { key: key });
                    } else if (!socket) {
                        showMessageBox("Hata", "Sunucuya bağlanılamadı. Lütfen sayfayı yenileyin.");
                    }
                } else {
                    // Diğer roller yazmaya çalıştığında uyarı göster
                    showMessageBox("Uyarı", "Bu rolde metin yazamazsınız. Göremeden rolündeki oyuncuyu yönlendirmeniz gerekiyor.");
                }
                event.preventDefault(); // Butonun varsayılan davranışını (örneğin form submit olmasını) engelle
            });
            virtualKeyboard.appendChild(button);
        });
    });
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
                socket.emit('role_select', { role: myRole }); // Sunucuya rol seçimi bilgisini gönder
                // Seçili rolü görsel olarak vurgula
                roleButtons.forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');

                applyRoleEffects(myRole); // Role özel efektleri uygula
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
    } else {
        blindOverlay.classList.remove('active'); // Diğer roller için kaldır
        document.body.classList.remove('blind-mode');
    }
    // Başlat butonu disabled durumu game_state eventi tarafından yönetilir.
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
        // Oyuncuya göre renk ataması (mevcut imleç sayısına göre)
        const colorIndex = Array.from(playerCursorsContainer.children).length % cursorColors.length;
        cursor.classList.add(`color-${colorIndex}`);

        const nicknameSpan = document.createElement('span'); // Nickname için span elementi
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
            // Nickname ve rolün baş harfini göster
            nicknameSpan.textContent = `${player.nickname} (${player.role.charAt(0).toUpperCase()})`;
        }
    }

    // Artık bağlı olmayan oyuncuların imleçlerini kaldır
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
    // İmleç konumlarını doğru hesaplamak için gameArea'nın boyutlarını al
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
    messageBox.classList.remove('hidden'); // hidden sınıfını kaldırarak göster
}

/**
 * Mesaj kutusunu gizler.
 */
function hideMessageBox() {
    messageBox.classList.add('hidden'); // hidden sınıfını ekleyerek gizle
}

// --- Socket.IO İletişimi ---

/**
 * Socket.IO bağlantısını başlatır ve olay dinleyicilerini kurar.
 */
function connectSocketIO() {
    // Socket.IO istemcisi varsayılan olarak mevcut sunucuya bağlanır.
    socket = io();

    socket.on('connect', () => {
        console.log('Socket.IO bağlantısı kuruldu.');
        gameStatusElement.textContent = "Bağlandı, rol seçin.";
        startGameButton.disabled = false; // Bağlantı kurulduğunda başlat butonu aktif
    });

    socket.on('player_id', (data) => {
        myPlayerId = data.id;
        playerIdDisplay.textContent = `Oyuncu ID: ${data.nickname}`; // Kendi nickname'imizi göster
        nicknameInput.value = data.nickname; // Nickname input alanına yaz
    });

    socket.on('game_state', (data) => {
        // Oyun durumu güncellemelerini işle
        updatePlayerCursors(data.players_info); // İmleçleri ve nickname'leri güncelle
        targetTextElement.textContent = data.target_text || 'Oyun başlamadı. Bir rol seçin ve oyunu başlatın.';
        typedTextElement.textContent = data.typed_text;
        timerElement.textContent = data.elapsed_time.toFixed(2); // Süreyi güncelle

        // Kendi oyuncumuzun rolünü ve görüntülenen nickname'ini güncelle
        if (myPlayerId && data.players_info[myPlayerId]) {
            const myInfo = data.players_info[myPlayerId];
            myRole = myInfo.role;
            playerIdDisplay.textContent = `Oyuncu ID: ${myInfo.nickname}`; // Kendi nickname'imizi güncel tut

            // Seçilen rol butonunu vurgula
            roleButtons.forEach(btn => {
                if (btn.id.replace('role-', '') === myRole) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            });
            applyRoleEffects(myRole); // Rol efektlerini uygula
        }

        // Oyunun başlayıp başlamadığını kontrol et ve buton durumlarını ayarla
        if (data.game_started) {
            gameStatusElement.textContent = "Oyun Devam Ediyor...";
            startGameButton.disabled = true; // Oyun başladıysa başlat devre dışı
            resetGameButton.disabled = false;
        } else {
            gameStatusElement.textContent = "Oyun Başlamadı.";
            if (socket.connected) { // Soket bağlıysa başlat butonu aktif olabilir
                startGameButton.disabled = false;
            }
            resetGameButton.disabled = false;
            // Oyun bittiyse ve süre varsa göster
            if (data.target_text && data.typed_text === data.target_text && data.elapsed_time > 0) {
                 gameStatusElement.textContent = "Oyun Bitti!";
                 // Oyun bittiğinde mesaj kutusu game_over eventinde gösteriliyor
            }
        }
    });

    socket.on('game_over', (data) => {
        // Oyun bittiğinde mesaj kutusu göster
        gameStatusElement.textContent = "Oyun Bitti!";
        startGameButton.disabled = false;
        resetGameButton.disabled = false;
        showMessageBox("Oyun Bitti!", `Tebrikler! Metni ${data.time_taken.toFixed(2)} saniyede yazdınız.`);
    });

    socket.on('message_box', (data) => {
        // Sunucudan gelen uyarı/bilgi mesajlarını göster
        showMessageBox(data.title, data.content);
    });

    socket.on('disconnect', () => {
        console.log('Socket.IO bağlantısı kesildi.');
        gameStatusElement.textContent = "Bağlantı Kesildi. Yeniden bağlanılıyor...";
        startGameButton.disabled = true;
        resetGameButton.disabled = true;
        // Yeniden bağlanmayı dene
        setTimeout(connectSocketIO, 3000);
    });

    socket.on('connect_error', (error) => {
        console.error('Socket.IO bağlantı hatası:', error);
        gameStatusElement.textContent = "Bağlantı Hatası. Yeniden bağlanılıyor...";
        startGameButton.disabled = true;
        resetGameButton.disabled = true;
    });
}

// --- Olay Dinleyicileri ---

// Fare hareketi olay dinleyicisi (imleçleri güncellemek için)
document.addEventListener('mousemove', (event) => {
    if (myPlayerId) {
        // İmleç konumunu oyun alanı (gameArea) elementine göre ayarla
        const x = event.clientX - gameAreaRect.left;
        const y = event.clientY - gameAreaRect.top;

        // Socket.IO ile 'cursor_move' olayı gönder
        socket.emit('cursor_move', {
            x: x,
            y: y
        });
    }
});

// Oyunu başlat butonu tıklama olayı
startGameButton.addEventListener('click', (event) => {
    // Kural: Göremeden rolü oyunu başlatamaz (butonu efektif olarak kullanamaz)
    if (myRole === 'goremeden') {
        showMessageBox("Uyarı", "Göremeden rolündeyken oyunu başlatamazsınız. Başka bir oyuncunun başlatması gerekiyor.");
        event.preventDefault(); // Varsayılan buton davranışını engelle
        return;
    }
    // Rol seçilmemişse uyarı ver
    if (!myRole) {
        showMessageBox("Rol Seçilmedi", "Lütfen oyunu başlatmadan önce bir rol seçin (Göremeden, Duymadan, Konuşmadan).");
        event.preventDefault();
        return;
    }
    socket.emit('start_game'); // Sunucuya oyunu başlatma isteği gönder
    event.preventDefault();
});

// Oyunu sıfırla butonu tıklama olayı
resetGameButton.addEventListener('click', (event) => {
    socket.emit('reset_game'); // Sunucuya oyunu sıfırlama isteği gönder
    // Kendi rolümüzü ve görsel efektleri de sıfırla
    myRole = null;
    roleButtons.forEach(btn => btn.classList.remove('selected')); // Tüm rol butonlarının seçimini kaldır
    applyRoleEffects(null); // Efektleri kaldır
    event.preventDefault();
});

// Mesaj kutusunu kapatma butonu tıklama olayı
closeMessageBox.addEventListener('click', hideMessageBox);

// Nickname değiştirme butonu tıklama olayı
changeNicknameButton.addEventListener('click', (event) => {
    const newNickname = nicknameInput.value.trim(); // Boşlukları temizle
    if (newNickname) {
        socket.emit('change_nickname', { nickname: newNickname }); // Sunucuya nickname değiştirme isteği gönder
    } else {
        showMessageBox("Uyarı", "Takma ad boş olamaz!");
    }
    event.preventDefault(); // Formun submit olmasını engelle
});


// Pencere yeniden boyutlandırıldığında veya kaydırıldığında oyun alanı dikdörtgenini güncelle
window.addEventListener('resize', updateGameAreaRect);
window.addEventListener('scroll', updateGameAreaRect);


// --- Sayfa Yüklendiğinde Çalışacak Fonksiyon ---
document.addEventListener('DOMContentLoaded', () => {
    createVirtualKeyboard(); // Sanal klavyeyi oluştur
    setupRoleSelection(); // Rol seçim butonlarını hazırla
    connectSocketIO(); // Socket.IO bağlantısını başlat
    updateGameAreaRect(); // Oyun alanı dikdörtgenini ilk başta ayarla
});
