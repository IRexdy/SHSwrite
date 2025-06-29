# app.py (veya projenizin ana Python dosyası)
from flask import Flask, render_template, request, session, copy_current_request_context
from flask_socketio import SocketIO, emit, join_room, leave_room
import time
import random
import uuid
import os

app = Flask(__name__)
# Gizli anahtar, oturum yönetimi ve güvenlik için gereklidir.
# Ortam değişkeninden (RENDER gibi platformlarda) veya varsayılan bir değerden alınır.
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'lutfen_burayi_guvenli_bir_anahtarla_degistirin')
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins="*")

# --- Oyun Durumu Değişkenleri ---
# Bağlı tüm Socket.IO oturumlarını tutan sözlük {sid: player_id}
connected_sids = {}
# Her oyuncunun ID'sini, imleç konumunu, takma adını ve SID'ini tutan sözlük
# {player_id: {'sid': str, 'x': int, 'y': int, 'nickname': str}}
player_data = {}
# Her oyuncunun seçtiği rolü tutan sözlük {player_id: str}
player_roles = {}
# Oyuncuların yazması gereken hedef metin
target_text = ""
# Oyuncuların şu ana kadar yazdığı metin
typed_text = ""
# Oyunun başlayıp başlamadığını gösteren bayrak
game_started = False
# Oyunun başlangıç zamanı (saniye cinsinden)
start_time = 0
# Oyunun bitiş zamanı (saniye cinsinden)
end_time = 0

# Önceden tanımlanmış metinler
PREDEFINED_TEXTS = [
    "Teknoloji, hayatımızı kolaylaştıran birçok yenilik sunar.",
    "Doğa yürüyüşleri, zihni dinlendirmek için harika bir yoldur.",
    "Kitap okumak, farklı dünyalara açılan bir kapıdır.",
    "Yaz mevsimi, güneşli günler ve uzun akşamlar demektir.",
    "Birlikte çalışmak, hedeflere ulaşmanın en etkili yoludur.",
    "Hayatta karşımıza çıkan zorluklar bizi daha güçlü yapar.",
    "Her yeni gün, yeni bir başlangıç için fırsattır.",
    "Sanat, insan ruhunun derinliklerini yansıtan bir aynadır."
]

# --- Yardımcı Fonksiyonlar ---
def get_game_state():
    """Güncel oyun durumunu bir sözlük olarak döndürür."""
    global game_started, target_text, typed_text, start_time, end_time

    # O anki geçen süre veya tamamlanan süre
    current_time = time.time()
    elapsed_time = 0
    if game_started and start_time > 0:
        elapsed_time = current_time - start_time
    elif not game_started and end_time > 0: # Oyun bittiyse bitiş süresini göster
        elapsed_time = end_time - start_time

    # Tüm oyuncu bilgilerini içeren bir sözlük oluştur
    players_info = {}
    for pid, data in player_data.items():
        players_info[pid] = {
            'x': data.get('x', 0),
            'y': data.get('y', 0),
            'nickname': data.get('nickname', f"Oyuncu_{pid[:4]}"), # Takma adı ekle
            'role': player_roles.get(pid, 'Rol Seçilmedi') # Rolü de ekle
        }

    return {
        "players_info": players_info, # Tüm oyuncu bilgilerini tek bir anahtarda gönder
        "target_text": target_text,
        "typed_text": typed_text,
        "game_started": game_started,
        "elapsed_time": round(elapsed_time, 2)
    }

# --- Flask Rotaları ---
@app.route("/")
def index():
    """Ana sayfayı (index.html) render eder."""
    return render_template("index.html")

# --- Socket.IO Olay İşleyicileri ---
@socketio.on('connect')
def handle_connect():
    """Yeni bir istemci bağlandığında çalışır."""
    player_id = str(uuid.uuid4())
    connected_sids[request.sid] = player_id
    # Yeni bağlanan oyuncuya varsayılan imleç konumu ve takma ad ata
    player_data[player_id] = {'sid': request.sid, 'x': 0, 'y': 0, 'nickname': f"Oyuncu_{player_id[:4]}"}
    print(f"Yeni oyuncu bağlandı: {player_id} (SID: {request.sid}). Toplam bağlı: {len(connected_sids)}")

    # Yeni oyuncuya kendi ID'sini ve varsayılan takma adını gönder
    emit('player_id', {'id': player_id, 'nickname': player_data[player_id]['nickname']}, room=request.sid)
    # Tüm istemcilere güncel oyun durumunu yayınla
    emit('game_state', get_game_state(), broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    """Bir istemci bağlantısı kesildiğinde çalışır."""
    player_id_to_remove = connected_sids.pop(request.sid, None)
    if player_id_to_remove:
        player_data.pop(player_id_to_remove, None)
        player_roles.pop(player_id_to_remove, None)
        print(f"Oyuncu bağlantısı kesildi: {player_id_to_remove} (SID: {request.sid}). Kalan bağlı: {len(connected_sids)}")

        # Eğer hiç oyuncu kalmazsa oyunu sıfırla
        if not connected_sids:
            print("Tüm oyuncular ayrıldı, oyun durumu sıfırlanıyor.")
            global target_text, typed_text, game_started, start_time, end_time
            target_text = ""
            typed_text = ""
            game_started = False
            start_time = 0
            end_time = 0
        
        # Durumu kalan oyunculara yayınla
        emit('game_state', get_game_state(), broadcast=True)

@socketio.on('cursor_move')
def handle_cursor_move(data):
    """İmleç hareketi mesajlarını işler."""
    player_id = connected_sids.get(request.sid)
    if player_id and 'x' in data and 'y' in data: # x ve y verileri varsa
        player_data[player_id]['x'] = data['x']
        player_data[player_id]['y'] = data['y']
        # Tüm istemcilere güncel oyun durumunu yayınla
        emit('game_state', get_game_state(), broadcast=True)

@socketio.on('key_press')
def handle_key_press(data):
    """Sanal klavye tuş basımı mesajlarını işler."""
    global typed_text, game_started, target_text, end_time
    player_id = connected_sids.get(request.sid)
    
    # Kural: SADECE 'goremeden' rolündeki oyuncu yazabilsin
    if player_id and player_roles.get(player_id) != 'goremeden':
        # Yazmaya çalışan diğer rollere uyarı gönder
        emit('message_box', {'title': 'Uyarı', 'content': 'Bu rolde metin yazamazsınız. Göremeden rolündeki oyuncuyu yönlendirmeniz gerekiyor.'}, room=request.sid)
        return # İşlemi sonlandır

    # Oyun başlamadıysa veya oyuncu ID'si yoksa tuş basımını dikkate alma
    if not game_started or not player_id:
        # Oyuncuya oyunun başlamadığını bildiren mesaj gönder (eğer gerekiyorsa)
        # Frontend'de bu kontrolü daha iyi ele alacağız.
        return

    key = data["key"]
    current_typed_len = len(typed_text)
    target_len = len(target_text)

    if key == "Backspace":
        if current_typed_len > 0:
            typed_text = typed_text[:-1]
    elif key == "Space":
        typed_text += " "
    elif key == "Enter":
        pass # Enter tuşu için şimdilik özel bir işlem yok
    elif len(key) == 1: # Tek karakterli tuşlar (harfler, rakamlar, semboller)
        # Sadece hedef metnin o anki karakteriyle eşleşiyorsa ekle
        if current_typed_len < target_len and key == target_text[current_typed_len]:
             typed_text += key
        else:
            # Yanlış tuş basıldı, burada hata sayacı eklenebilir
            pass

    # Metin tamamlandı mı kontrol et
    if typed_text == target_text and target_text != "":
        game_started = False
        end_time = time.time()
        print(f"Oyun bitti! Süre: {round(end_time - start_time, 2)} saniye.")
        # Oyun bitim mesajını tüm istemcilere yayınla
        emit('game_over', {'time_taken': round(end_time - start_time, 2)}, broadcast=True)

    # Güncel metin durumunu tüm istemcilere yayınla
    emit('game_state', get_game_state(), broadcast=True)


@socketio.on('role_select')
def handle_role_select(data):
    """Oyuncu rolü seçimi mesajlarını işler."""
    player_id = connected_sids.get(request.sid)
    if player_id and 'role' in data:
        role = data["role"]
        player_roles[player_id] = role
        print(f"Oyuncu {player_id} rolünü seçti: {role}")
        emit('game_state', get_game_state(), broadcast=True) # Rol güncellemelerini yayınla

@socketio.on('change_nickname')
def handle_change_nickname(data):
    """Oyuncu takma adı değiştirme mesajlarını işler."""
    player_id = connected_sids.get(request.sid)
    if player_id and 'nickname' in data:
        new_nickname = data['nickname'].strip() # Boşlukları temizle
        if new_nickname: # Takma ad boş değilse
            player_data[player_id]['nickname'] = new_nickname
            print(f"Oyuncu {player_id} takma adını '{new_nickname}' olarak değiştirdi.")
            emit('game_state', get_game_state(), broadcast=True) # Takma ad değişikliğini yayınla
        else:
            # Boş takma ad girildiğinde uyarı gönder
            emit('message_box', {'title': 'Uyarı', 'content': 'Takma ad boş olamaz.'}, room=request.sid)


@socketio.on('start_game')
def handle_start_game():
    """Oyunu başlatma mesajını işler."""
    global game_started, target_text, typed_text, start_time, end_time
    # Oyun başlamadıysa ve en az bir oyuncu bağlıysa
    if not game_started and len(connected_sids) >= 1:
        target_text = random.choice(PREDEFINED_TEXTS) # Rastgele bir metin seç
        typed_text = "" # Yazılan metni sıfırla
        game_started = True
        start_time = time.time()
        end_time = 0
        print(f"Oyun başladı! Hedef Metin: '{target_text}'")
        emit('game_state', get_game_state(), broadcast=True)
    else:
        print("Oyun başlamak için yeterli oyuncu yok veya zaten başlamış.")

@socketio.on('reset_game')
def handle_reset_game():
    """Oyunu sıfırlama mesajını işler."""
    global target_text, typed_text, game_started, start_time, end_time
    target_text = ""
    typed_text = ""
    game_started = False
    start_time = 0
    end_time = 0
    
    # Tüm oyuncuların bilgilerini ve rollerini sıfırla (bağlantıları koru)
    for pid in list(player_data.keys()):
        player_data[pid]['x'] = 0
        player_data[pid]['y'] = 0
        player_data[pid]['nickname'] = f"Oyuncu_{pid[:4]}" # Nickname'i varsayılana döndür
        player_roles.pop(pid, None) # Rolü kaldır

    print("Oyun sıfırlandı.")
    emit('game_state', get_game_state(), broadcast=True) # Durumu yayınla


if __name__ == "__main__":
    # Flask uygulamasını Socket.IO ile çalıştır
    # debug=True geliştirme için iyidir, ancak üretimde False olmalı
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
