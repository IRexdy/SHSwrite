from flask import Flask, render_template, request, session, copy_current_request_context
from flask_socketio import SocketIO, emit, join_room, leave_room
import time
import random
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'sizin_gizli_anahtariniz_buraya'
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins="*")

connected_sids = {}
player_data = {} # Artık {'sid': str, 'x': int, 'y': int, 'nickname': str} içerecek
player_roles = {}
target_text = ""
typed_text = ""
game_started = False
start_time = 0
end_time = 0

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

def get_game_state():
    global game_started, target_text, typed_text, start_time, end_time

    current_time = time.time()
    elapsed_time = 0
    if game_started and start_time > 0:
        elapsed_time = current_time - start_time
    elif not game_started and end_time > 0:
        elapsed_time = end_time - start_time

    # İmleçler, roller ve takma adlar için birleşik bir oyuncu listesi oluştur
    players_info = {}
    for pid, data in player_data.items():
        players_info[pid] = {
            'x': data.get('x', 0),
            'y': data.get('y', 0),
            'nickname': data.get('nickname', f"Oyuncu_{pid[:4]}"), # Nickname'i ekle
            'role': player_roles.get(pid, 'Rol Seçilmedi') # Rolü de ekle
        }

    return {
        "players_info": players_info, # Tüm oyuncu bilgilerini tek bir anahtarda gönder
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
    player_data[player_id] = {'sid': request.sid, 'x': 0, 'y': 0, 'nickname': f"Oyuncu_{player_id[:4]}"} # Varsayılan takma ad
    print(f"Yeni oyuncu bağlandı: {player_id} (SID: {request.sid}). Toplam bağlı: {len(connected_sids)}")

    emit('player_id', {'id': player_id, 'nickname': player_data[player_id]['nickname']}, room=request.sid)
    emit('game_state', get_game_state(), broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    player_id_to_remove = connected_sids.pop(request.sid, None)
    if player_id_to_remove:
        player_data.pop(player_id_to_remove, None)
        player_roles.pop(player_id_to_remove, None)
        print(f"Oyuncu bağlantısı kesildi: {player_id_to_remove} (SID: {request.sid}). Kalan bağlı: {len(connected_sids)}")

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
    if not game_started or not player_id:
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
        pass
    elif len(key) == 1:
        if current_typed_len < target_len and key == target_text[current_typed_len]:
            typed_text += key
        else:
            pass

    if typed_text == target_text and target_text != "":
        game_started = False
        end_time = time.time()
        print(f"Oyun bitti! Süre: {round(end_time - start_time, 2)} saniye.")
        emit('game_over', {'time_taken': round(end_time - start_time, 2)}, broadcast=True)

    emit('game_state', get_game_state(), broadcast=True)

@socketio.on('role_select')
def handle_role_select(data):
    player_id = connected_sids.get(request.sid)
    if player_id and 'role' in data:
        role = data["role"]
        player_roles[player_id] = role
        print(f"Oyuncu {player_id} rolünü seçti: {role}")
        emit('game_state', get_game_state(), broadcast=True)

@socketio.on('change_nickname')
def handle_change_nickname(data):
    player_id = connected_sids.get(request.sid)
    if player_id and 'nickname' in data:
        new_nickname = data['nickname'].strip()
        if new_nickname: # Boş takma adlara izin verme
            player_data[player_id]['nickname'] = new_nickname
            print(f"Oyuncu {player_id} takma adını '{new_nickname}' olarak değiştirdi.")
            emit('game_state', get_game_state(), broadcast=True)
        else:
            emit('message_box', {'title': 'Uyarı', 'content': 'Takma ad boş olamaz.'}, room=request.sid)


@socketio.on('start_game')
def handle_start_game():
    global game_started, target_text, typed_text, start_time, end_time
    if not game_started and len(connected_sids) >= 1:
        target_text = random.choice(PREDEFINED_TEXTS)
        typed_text = ""
        game_started = True
        start_time = time.time()
        end_time = 0
        print(f"Oyun başladı! Hedef Metin: '{target_text}'")
        emit('game_state', get_game_state(), broadcast=True)
    else:
        print("Oyun başlamak için yeterli oyuncu yok veya zaten başlamış.")

@socketio.on('reset_game')
def handle_reset_game():
    global target_text, typed_text, game_started, start_time, end_time
    target_text = ""
    typed_text = ""
    game_started = False
    start_time = 0
    end_time = 0
    player_data.clear()
    player_roles.clear()
    connected_sids.clear()
    print("Oyun sıfırlandı.")
    emit('game_state', get_game_state(), broadcast=True)

if __name__ == "__main__":
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
