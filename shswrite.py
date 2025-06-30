# app.py (veya projenizin ana Python dosyası)
from flask import Flask, render_template, request, session, copy_current_request_context
from flask_socketio import SocketIO, emit, join_room, leave_room
import time
import random
import uuid
import os
import string # Noktalama işaretlerini kaldırmak için eklendi

app = Flask(__name__)
# Gizli anahtar, oturum yönetimi ve güvenlik için gereklidir.
# Ortam değişkeninden (RENDER gibi platformlarda) veya varsayılan bir değerden alınır.
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', '1eq2r345tbn89s990zr64jgthnmb252')
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins="*")

# --- Oyun Durumu Değişkenleri ---
connected_sids = {}
player_data = {}
player_roles = {}
target_text = ""
typed_text = ""
game_started = False
start_time = 0
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

    current_time = time.time()
    elapsed_time = 0
    if game_started and start_time > 0:
        elapsed_time = current_time - start_time
    elif not game_started and end_time > 0:
        elapsed_time = end_time - start_time

    players_info = {}
    for pid, data in player_data.items():
        players_info[pid] = {
            'x': data.get('x', 0),
            'y': data.get('y', 0),
            'nickname': data.get('nickname', f"Oyuncu_{pid[:4]}"),
            'role': player_roles.get(pid, 'Rol Seçilmedi')
        }

    return {
        "players_info": players_info,
        "target_text": target_text,
        "typed_text": typed_text,
        "game_started": game_started,
        "elapsed_time": round(elapsed_time, 2)
    }

@app.route("/")
def index():
    return render_template("index.html")

@socketio.on('connect')
def handle_connect():
    player_id = str(uuid.uuid4())
    connected_sids[request.sid] = player_id
    player_data[player_id] = {'sid': request.sid, 'x': 0, 'y': 0, 'nickname': f"Oyuncu_{player_id[:4]}"}
    print(f"Yeni oyuncu bağlandı: {player_id} (SID: {request.sid}). Toplam bağlı: {len(connected_sids)}")
    print(f"CONNECT: Current player_data: {player_data}")
    print(f"CONNECT: Current player_roles: {player_roles}")

    emit('player_id', {'id': player_id, 'nickname': player_data[player_id]['nickname']}, room=request.sid)
    emit('game_state', get_game_state(), broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    player_id_to_remove = connected_sids.pop(request.sid, None)
    if player_id_to_remove:
        player_data.pop(player_id_to_remove, None)
        player_roles.pop(player_id_to_remove, None)
        print(f"Oyuncu bağlantısı kesildi: {player_id_to_remove} (SID: {request.sid}). Kalan bağlı: {len(connected_sids)}")
        print(f"DISCONNECT: Current player_data: {player_data}")
        print(f"DISCONNECT: Current player_roles: {player_roles}")

        if not connected_sids:
            print("Tüm oyuncular ayrıldı, oyun durumu sıfırlanıyor.")
            global target_text, typed_text, game_started, start_time, end_time
            target_text = ""
            typed_text = ""
            game_started = False
            start_time = 0
            end_time = 0
        
        emit('game_state', get_game_state(), broadcast=True)

@socketio.on('cursor_move')
def handle_cursor_move(data):
    player_id = connected_sids.get(request.sid)
    if player_id and 'x' in data and 'y' in data:
        player_data[player_id]['x'] = data['x']
        player_data[player_id]['y'] = data['y']
        emit('game_state', get_game_state(), broadcast=True)

@socketio.on('key_press')
def handle_key_press(data):
    global typed_text, game_started, target_text, end_time
    player_id = connected_sids.get(request.sid)
    
    current_player_role = player_roles.get(player_id)
    print(f"KEY_PRESS: Player ID: {player_id}, Role: {current_player_role}, Game started: {game_started}, Key: {data['key']}")
    print(f"KEY_PRESS: Full player_roles dict: {player_roles}")

    # Kural: SADECE 'goremeden' rolündeki oyuncu yazabilsin
    if player_id and current_player_role != 'goremeden':
        emit('message_box', {'title': 'Uyarı', 'content': 'Bu rolde metin yazamazsınız. Göremeden rolündeki oyuncuyu yönlendirmeniz gerekiyor.'}, room=request.sid)
        print(f"KEY_PRESS: Key press ignored for non-goremeden role: {current_player_role}")
        return

    # Oyun başlamadıysa veya oyuncu ID'si yoksa tuş basımını dikkate alma
    if not game_started or not player_id:
        print(f"KEY_PRESS: Key press ignored because game_started={game_started} or player_id={player_id}")
        return

    key = data["key"]
    current_typed_len = len(typed_text)
    target_len = len(target_text)

    # 'goremeden' rolü için tuş basımı mantığı
    # Bu blok, yukarıdaki 'if current_player_role != 'goremeden'' kontrolünden geçildiği için sadece 'goremeden' rolü için çalışır.
    if key == "Backspace":
        if current_typed_len > 0:
            typed_text = typed_text[:-1]
            print(f"KEY_PRESS: Backspace pressed by goremeden. New typed text: '{typed_text}'")
    elif key == "Space":
        typed_text += " "
        print(f"KEY_PRESS: Space pressed by goremeden. New typed text: '{typed_text}'")
    elif key == "Enter":
        print(f"KEY_PRESS: Enter pressed by goremeden. Typed text: '{typed_text}'")
        pass
    elif len(key) == 1:
        # Göremeden rolü için karakter eşleşme kontrolünü kaldırıyoruz.
        # Herhangi bir karakteri yazmasına izin veriyoruz.
        typed_text += key
        print(f"KEY_PRESS: Key '{key}' pressed by goremeden. New typed text: '{typed_text}'")
    else:
        print(f"KEY_PRESS: Unknown key type received: {key}")

    # Metin tamamlandı mı kontrol et (Bu kontrol hala geçerli ve genel)
    if typed_text == target_text and target_text != "":
        game_started = False
        end_time = time.time()
        print(f"GAME_OVER: Oyun bitti! Süre: {round(end_time - start_time, 2)} saniye.")
        emit('game_over', {'time_taken': round(end_time - start_time, 2)}, broadcast=True)

    emit('game_state', get_game_state(), broadcast=True)

@socketio.on('role_select')
def handle_role_select(data):
    player_id = connected_sids.get(request.sid)
    if player_id and 'role' in data:
        role = data["role"]
        player_roles[player_id] = role
        print(f"ROLE_SELECT: Oyuncu {player_id} rolünü seçti: {role}")
        print(f"ROLE_SELECT: Current player_roles: {player_roles}")
        emit('game_state', get_game_state(), broadcast=True)

@socketio.on('change_nickname')
def handle_change_nickname(data):
    player_id = connected_sids.get(request.sid)
    if player_id and 'nickname' in data:
        new_nickname = data['nickname'].strip()
        if new_nickname:
            player_data[player_id]['nickname'] = new_nickname
            print(f"CHANGE_NICKNAME: Oyuncu {player_id} takma adını '{new_nickname}' olarak değiştirdi.")
            emit('game_state', get_game_state(), broadcast=True)
        else:
            emit('message_box', {'title': 'Uyarı', 'content': 'Takma ad boş olamaz.'}, room=request.sid)

@socketio.on('start_game')
def handle_start_game():
    global game_started, target_text, typed_text, start_time, end_time
    if not game_started and len(connected_sids) >= 1:
        target_text_raw = random.choice(PREDEFINED_TEXTS)
        # Hedef metni küçük harfe çevir ve noktalama işaretlerini kaldır
        target_text = target_text_raw.lower().translate(str.maketrans('', '', string.punctuation))
        typed_text = ""
        game_started = True
        start_time = time.time()
        end_time = 0
        print(f"START_GAME: Oyun başladı! Hedef Metin: '{target_text}' (Uzunluk: {len(target_text)}). Game_started: {game_started}")
        emit('game_state', get_game_state(), broadcast=True)
    else:
        print(f"START_GAME: Oyun başlatılamadı: game_started={game_started}, connected_sids={len(connected_sids)}")

@socketio.on('reset_game')
def handle_reset_game():
    global target_text, typed_text, game_started, start_time, end_time
    target_text = ""
    typed_text = ""
    game_started = False
    start_time = 0
    end_time = 0
    
    for pid in list(player_data.keys()):
        player_data[pid]['x'] = 0
        player_data[pid]['y'] = 0
        player_data[pid]['nickname'] = f"Oyuncu_{pid[:4]}"
        player_roles.pop(pid, None)

    print("RESET_GAME: Oyun sıfırlandı.")
    print(f"RESET_GAME: Current player_roles: {player_roles}")
    emit('game_state', get_game_state(), broadcast=True)

if __name__ == "__main__":
    socketio.run(app, debug=True)
