const $ = selector => document.querySelector(selector);
const query = new URLSearchParams(location.search);
let session = null;
let snapshot = null;
let timer;
let polling = false;
let busy = false;
const storageKey = 'apscento-room';
try { session = JSON.parse(sessionStorage.getItem(storageKey)); } catch { /* Pamięć może być wyłączona. */ }
if (session && (!/^\d{6}$/.test(session.code) || !/^[a-f0-9]{48}$/.test(session.token) || !['host', 'player'].includes(session.role))) session = null;
if (query.has('code') && query.get('code') !== session?.code) session = null;
const requestedGame = ['mafia', 'quiz', 'tokyo', 'brudne'].includes(query.get('game')) ? query.get('game') : null;
if (session && requestedGame && (session.game || 'quiz') !== requestedGame) session = null;
let gameType = requestedGame || session?.game || 'quiz';

function applyGameBranding() {
  if (gameType === 'brudne') {
    document.body.classList.add('brudne-room');
    document.title = 'Milionerowe Brudne Zagrywki — Apscento';
    $('.edition').innerHTML = '<i></i> Milionerzy rozszerzeni';
    $('.room-main > .eyebrow').textContent = 'APSCENTO / MILIONEROWE BRUDNE ZAGRYWKI';
    $('.room-intro h1').innerHTML = 'Karty na stół.<br><em>Zasady są brudne.</em>';
    $('.room-intro > p').innerHTML = 'Trzy tury, karty mocy i walka o życie.<br>Punkty to tylko połowa gry.';
    $('#host-form h2').textContent = 'Rozdaj karty, zacznij ustawki.';
    $('#host-form p').textContent = 'Utwórz pokój dla przynajmniej dwóch osób. Organizator prowadzi kolejne tury.';
    $('.invite-note').textContent = 'Brudne Zagrywki · karty mocy i tura na przetrwanie';
    $('#start-game').innerHTML = 'Rozdaj karty i zacznij <span aria-hidden="true">→</span>';
    return;
  }
  if (gameType === 'tokyo') {
    document.body.classList.add('mafia-room', 'tokyo-room');
    document.title = 'Tokyo: Yakuza Underworld — Apscento';
    $('.edition').innerHTML = '<i></i> Mafia rozszerzona';
    $('.room-main > .eyebrow').textContent = 'APSCENTO / TOKYO: YAKUZA UNDERWORLD';
    $('.room-intro h1').innerHTML = 'Neony gasną.<br><em>Tokio nie śpi.</em>';
    $('.room-intro > p').innerHTML = 'Siedem wyjątkowych ról.<br>Karty mocy i walka trzech frakcji.';
    $('#host-form h2').textContent = 'Zbierz podziemie Tokio.';
    $('#host-form p').textContent = 'Utwórz pokój dla przynajmniej ośmiu osób. Organizator prowadzi kolejne etapy.';
    $('#capacity').value = '8';
    [...$('#capacity').options].forEach(option => option.disabled = Number(option.value) < 8);
    $('.invite-note').textContent = 'Tokyo · Yakuza, Policja i Ronin';
    $('#start-game').innerHTML = 'Rozdaj role i karty <span aria-hidden="true">→</span>';
    return;
  }
  if (gameType !== 'mafia') return;
  document.body.classList.add('mafia-room');
  document.title = 'Pokój Mafii — Apscento';
  $('.edition').innerHTML = '<i></i> Mafia podstawowa';
  $('.room-main > .eyebrow').textContent = 'APSCENTO / MAFIA PODSTAWOWA';
  $('.room-intro h1').innerHTML = 'Miasto zasypia.<br><em>Zaczyna się gra.</em>';
  $('.room-intro > p').innerHTML = 'Tajne role na telefonach.<br>Decyzje przy wspólnym stole.';
  $('#host-form h2').textContent = 'Poprowadź własne miasto.';
  $('#host-form p').textContent = 'Utwórz pokój i zaproś przynajmniej cztery osoby. Organizator prowadzi kolejne etapy.';
  $('#capacity option:first-child').disabled = true;
  $('.invite-note').textContent = 'Mafia podstawowa · tajne role i wspólne głosowanie';
  $('#start-game').innerHTML = 'Rozdaj role i zacznij <span aria-hidden="true">→</span>';
}
applyGameBranding();

function saveSession(value) {
  session = value;
  try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); }
  catch { $('#room-notice').textContent = 'Ta przeglądarka nie zapisuje sesji. Po odświeżeniu trzeba będzie dołączyć ponownie.'; }
}
function showError(message = '') { $('#room-error').textContent = message; $('#room-error').hidden = !message; }
async function api(endpoint, body, credential = session?.token) {
  if (window.APSCENTO_SUPABASE) return supabaseApi(endpoint, body, credential);
  const headers = { 'Content-Type': 'application/json' };
  if (credential) headers.Authorization = `Bearer ${credential}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`api/${endpoint}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status });
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw new Error('Brak połączenia z pokojem. Sprawdź sieć i czy lokalny serwer działa.');
  } finally { clearTimeout(timeout); }
}
async function supabaseApi(endpoint, body, credential) {
  if (endpoint === 'info') {
    try { return await (await fetch('api/info')).json(); }
    catch { return { addresses: [location.origin] }; }
  }
  const match = endpoint.match(/^rooms(?:\/(\d{6}))?(?:\/(join|ready|leave|close|start|answer|advance))?$/);
  if (!match) throw new Error('Nieprawidłowa operacja pokoju.');
  const [, code, action] = match;
  const creators = { tokyo: 'create_tokyo_room', mafia: 'create_mafia_room', brudne: 'create_brudne_room' };
  const getters = { tokyo: 'get_tokyo_room', mafia: 'get_mafia_room', brudne: 'get_brudne_room' };
  const starters = { tokyo: 'start_tokyo_game', mafia: 'start_mafia_game', brudne: 'start_brudne_game' };
  const advancers = { tokyo: 'advance_tokyo_game', mafia: 'advance_mafia_game', brudne: 'advance_brudne_game' };
  const calls = {
    create: [creators[gameType] || 'create_game_room', { p_capacity: body?.capacity }],
    join: ['join_game_room', { p_code: code, p_name: body?.name }],
    get: [getters[gameType] || 'get_game_room', { p_code: code, p_token: credential }],
    ready: ['set_player_ready', { p_code: code, p_token: credential, p_ready: body?.ready }],
    start: [starters[gameType] || 'start_quiz_game', { p_code: code, p_token: credential }],
    answer: gameType === 'tokyo' ? ['submit_tokyo_action', { p_code: code, p_token: credential, p_action: body?.kind, p_target: body?.target || null, p_message: body?.message || null }]
      : gameType === 'mafia' ? ['submit_mafia_action', { p_code: code, p_token: credential, p_target: body?.target }]
      : gameType === 'brudne' ? ['submit_brudne_action', { p_code: code, p_token: credential, p_action: body?.kind, p_card: body?.card || null, p_target: body?.target || null, p_answer: body?.answer ?? null }]
      : ['submit_quiz_answer', { p_code: code, p_token: credential, p_answer: body?.answer }],
    advance: [advancers[gameType] || 'advance_quiz_game', { p_code: code, p_token: credential }],
    leave: ['leave_game_room', { p_code: code, p_token: credential }],
    close: ['close_game_room', { p_code: code, p_token: credential }]
  };
  const [name, payload] = calls[action || (code ? 'get' : 'create')];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const { url, key } = window.APSCENTO_SUPABASE;
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal
    });
    const data = response.status === 204 ? { ok: true } : await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message || 'Supabase odrzucił operację.'), { status: response.status });
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw new Error('Brak połączenia z Supabase. Sprawdź internet i spróbuj ponownie.');
  } finally { clearTimeout(timeout); }
}
function mode(host) {
  $('#host-form').hidden = !host; $('#join-form').hidden = host;
  $('#host-mode').setAttribute('aria-pressed', String(host)); $('#join-mode').setAttribute('aria-pressed', String(!host));
  showError();
}
$('#host-mode').onclick = () => mode(true);
$('#join-mode').onclick = () => mode(false);
$('#code').value = /^\d{6}$/.test(query.get('code')) ? query.get('code') : '';
mode(query.get('mode') === 'host');

async function submit(event, create) {
  event.preventDefault();
  if (busy) return;
  busy = true; showError();
  const button = event.target.querySelector('[type=submit]'); button.disabled = true;
  try {
    const data = create ? await api('rooms', { capacity: Number($('#capacity').value) }, null)
      : await api(`rooms/${$('#code').value}/join`, { name: $('#nickname').value }, null);
    gameType = data.game || gameType; applyGameBranding(); saveSession(data);
    await enterLobby();
  } catch (error) { showError(error.message); }
  finally { busy = false; button.disabled = false; if (snapshot) render(snapshot); }
}
$('#host-form').onsubmit = event => submit(event, true);
$('#join-form').onsubmit = event => submit(event, false);

async function enterLobby() {
  $('#setup').hidden = true; $('#lobby').hidden = false;
  $('#room-code').textContent = session.code;
  const host = session.role === 'host';
  $('#lobby-subtitle').textContent = host ? 'Zaproś ekipę. Każdy gracz pojawi się tutaj po dołączeniu.' : gameType === 'brudne' ? 'Zaraz dostaniesz dwie losowe karty mocy. Potwierdź gotowość i czekaj na start.' : gameType === 'tokyo' ? 'Wchodzisz do tokijskiego podziemia. Potwierdź gotowość i czekaj na rolę oraz kartę.' : gameType === 'mafia' ? 'Jesteś w mieście. Gdy potwierdzisz gotowość, czekaj na rozdanie tajnych ról.' : 'Jesteś w pokoju. Daj znać ekipie, kiedy możesz zaczynać.';
  $('#host-invite').hidden = !host; $('#ready-button').hidden = host; $('#start-game').hidden = !host;
  $('#leave-room').textContent = host ? 'Zamknij pokój' : 'Opuść pokój';
  $('#lobby-heading').focus();
  if (host) {
    const addresses = [location.origin];
    try { const info = await api('info'); addresses.push(...info.addresses); }
    catch { /* Polling poniżej pokazuje stan połączenia. */ }
    const origins = [...new Set(addresses)];
    $('#join-address').replaceChildren(...origins.map(origin => new Option(origin, origin)));
    $('#join-address').value = origins.find(origin => !/\/\/(127\.0\.0\.1|localhost)(:|$)/.test(origin)) || origins[0];
    updateInvitation();
  }
  await poll();
}
function updateInvitation() {
  const origin = $('#join-address').value;
  const url = new URL('room.html', `${origin}${location.pathname}`);
  url.searchParams.set('code', session.code);
  if (gameType !== 'quiz') url.searchParams.set('game', gameType);
  $('#join-link').href = url.href;
  $('#join-link').textContent = url.href;
  const qr = qrcode(0, 'M'); qr.addData(url.href); qr.make();
  $('#join-qr').src = qr.createDataURL(6, 8);
  $('#network-note').textContent = /\/\/(127\.0\.0\.1|localhost)(:|$)/.test(origin)
    ? 'Lokalny adres działa tylko na komputerze. Po publikacji zaproszenie zadziała z dowolnego telefonu.'
    : 'Otwórz ten adres na telefonie. Pokój jest synchronizowany przez Supabase.';
}
$('#join-address').onchange = updateInvitation;
$('#copy-link').onclick = async () => {
  try { await navigator.clipboard.writeText($('#join-link').href); $('#room-notice').textContent = 'Zaproszenie skopiowane.'; }
  catch { $('#room-notice').textContent = 'Skopiuj ręcznie adres zaproszenia widoczny powyżej.'; }
};

function render(room) {
  snapshot = room;
  $('#connection').textContent = '● Połączono';
  if (room.phase !== 'lobby') return room.game === 'brudne' ? renderBrudne(room) : room.game === 'tokyo' ? renderTokyo(room) : room.game === 'mafia' ? renderMafia(room) : renderGame(room);
  $('#game').hidden = true; $('#lobby').hidden = false;
  $('#player-count').textContent = `${room.players.length} / ${room.capacity}`;
  const ready = room.players.filter(p => p.ready).length;
  $('#ready-count').textContent = `${ready} gotowych`;
  $('#empty-room').hidden = room.players.length > 0;
  $('#players').replaceChildren(...room.players.map(player => {
    const item = document.createElement('li');
    const avatar = document.createElement('span'); avatar.className = 'player-avatar'; avatar.textContent = player.name[0].toUpperCase(); avatar.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.className = 'player-name'; name.textContent = player.name + (player.id === room.me ? ' (ty)' : '');
    const status = document.createElement('span'); status.className = `player-state${player.ready ? ' is-ready' : ''}`; status.textContent = !player.online ? 'Poza siecią' : player.ready ? '✓ Gotowość' : 'W poczekalni';
    item.append(avatar, name, status); return item;
  }));
  const me = room.players.find(p => p.id === room.me);
  $('#ready-button').textContent = me?.ready ? 'Jeszcze chwila — cofnij gotowość' : 'Jestem gotowy/a ✓';
  $('#ready-button').disabled = busy;
  const minimum = room.game === 'tokyo' ? 8 : room.game === 'mafia' ? 4 : 2;
  const canStart = room.players.length >= minimum && room.players.every(p => p.ready && p.online);
  $('#start-game').disabled = busy || !canStart;
  $('#lobby-message').textContent = room.players.length < minimum ? `Do tej gry potrzeba przynajmniej ${minimum} osób.` : canStart ? 'Cała ekipa jest gotowa. Można zaczynać!' : 'Czekamy, aż wszyscy potwierdzą gotowość.';
}

function renderGame(room) {
  $('#lobby').hidden = true; $('#game').hidden = false;
  $('.scoreboard h2').textContent = 'Ranking';
  $('#game-code').textContent = room.code;
  $('#scoreboard').replaceChildren(...room.players.map((player, index) => {
    const item = document.createElement('li');
    item.append(document.createTextNode(player.name));
    const score = document.createElement('span'); score.textContent = `${player.score} pkt`;
    item.append(score); return item;
  }));
  if (room.phase === 'finished') {
    $('#question-panel').classList.remove('category-stage');
    $('#game-round').textContent = 'MILIONERZY / KONIEC GRY';
    $('#game-timer').textContent = '✓';
    $('#question-text').textContent = room.players[0] ? `Wygrywa ${room.players[0].name}!` : 'Koniec gry';
    $('#game-answers').replaceChildren();
    $('#game-message').textContent = 'Dzięki za wspólną rundę. Wyniki są widoczne w rankingu.';
    $('#advance-game').hidden = true;
    $('#finish-room').hidden = false;
    $('#finish-room').textContent = room.role === 'host' ? 'Zamknij pokój i wróć' : 'Opuść grę';
    return;
  }
  $('#finish-room').hidden = false;
  $('#finish-room').textContent = room.role === 'host' ? 'Zakończ grę' : 'Opuść grę';
  const question = room.question;
  if (room.phase === 'category') {
    $('#question-panel').classList.add('category-stage');
    $('#game-round').textContent = `MILIONERZY / PYTANIE ${question.number} Z ${question.total}`;
    $('#game-timer').textContent = room.seconds_left;
    $('#question-text').textContent = question.category;
    $('#game-answers').replaceChildren();
    $('#game-message').textContent = 'Oto kategoria. Za chwilę pojawi się pytanie.';
    $('#advance-game').hidden = true;
    return;
  }
  $('#question-panel').classList.remove('category-stage');
  $('#game-round').textContent = `MILIONERZY / ${question.category.toUpperCase()} / PYTANIE ${question.number} Z ${question.total}`;
  $('#game-timer').textContent = room.phase === 'question' ? room.seconds_left : '0';
  $('#question-text').textContent = question.text;
  const me = room.players.find(p => p.id === room.me);
  $('#game-answers').replaceChildren(...question.answers.map((answer, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'game-answer'; button.dataset.answer = index;
    const mark = document.createElement('b'); mark.textContent = 'ABCD'[index];
    button.append(mark, document.createTextNode(answer));
    if (me?.answer === index) button.classList.add('is-picked');
    if (room.phase === 'reveal' && index === question.correct) button.classList.add('is-correct');
    if (room.phase === 'reveal' && me?.answer === index && index !== question.correct) button.classList.add('is-wrong');
    button.disabled = room.role === 'host' || room.phase !== 'question' || me?.answered || busy;
    button.onclick = () => submitAnswer(index);
    return button;
  }));
  const answered = room.players.filter(p => p.answered).length;
  if (room.phase === 'reveal') $('#game-message').textContent = question.explanation;
  else if (room.role === 'host') $('#game-message').textContent = `Odpowiedziało ${answered} z ${room.players.length} graczy.`;
  else $('#game-message').textContent = me?.answered ? 'Odpowiedź zapisana. Czekamy na pozostałych.' : 'Wybierz odpowiedź na swoim telefonie.';
  $('#advance-game').hidden = room.role !== 'host';
  $('#advance-game').disabled = busy || (room.phase === 'question' && answered < room.players.filter(p => p.online).length && room.seconds_left > 0);
  $('#advance-game').textContent = room.phase === 'reveal' ? (question.number === question.total ? 'Zakończ grę →' : 'Następne pytanie →') : 'Pokaż odpowiedź →';
}

function renderMafia(room) {
  $('#lobby').hidden = true; $('#game').hidden = false;
  $('.scoreboard h2').textContent = 'Miasto';
  $('#question-panel').classList.remove('category-stage');
  $('#game-code').textContent = room.code;
  const roleNames = { mafia: 'Mafia', detektyw: 'Detektyw', mieszkaniec: 'Mieszkaniec' };
  $('#scoreboard').replaceChildren(...room.players.map(player => {
    const item = document.createElement('li'); item.className = `${player.alive ? '' : 'is-dead'}${room.speaker?.id === player.id ? ' is-speaking' : ''}`.trim();
    item.append(document.createTextNode(player.name));
    const state = document.createElement('span');
    state.textContent = room.phase === 'mafia_finished' ? roleNames[player.role] : player.alive ? 'w grze' : 'odpada';
    item.append(state); return item;
  }));
  $('#finish-room').hidden = false;
  $('#finish-room').textContent = room.role === 'host' ? 'Zakończ grę' : 'Opuść grę';
  $('#advance-game').hidden = room.role !== 'host' || room.phase === 'mafia_finished';
  $('#advance-game').disabled = busy || (['mafia_night','mafia_vote'].includes(room.phase) && room.actions_done < room.actions_required);
  $('#game-answers').replaceChildren();
  const me = room.players.find(player => player.id === room.me);
  const setTargets = (players, label) => $('#game-answers').replaceChildren(...players.map(player => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'game-answer mafia-target';
    const mark = document.createElement('b'); mark.textContent = player.name[0].toUpperCase();
    button.append(mark, document.createTextNode(player.name));
    button.disabled = busy || me?.acted;
    button.onclick = () => submitMafiaTarget(player.id);
    button.setAttribute('aria-label', `${label}: ${player.name}`);
    return button;
  }));
  if (room.phase === 'mafia_intro') {
    $('#game-round').textContent = 'MAFIA / TAJNE ROLE'; $('#game-timer').textContent = '◆';
    $('#question-text').textContent = room.role === 'host' ? 'Role zostały rozdane.' : `Twoja rola: ${roleNames[room.my_role]}`;
    const descriptions = { mafia: `Znajdź swoich ludzi: ${room.mafia_team.map(p => p.name).join(', ')}. Nocą wspólnie wybierzecie cel.`, detektyw: 'Każdej nocy sprawdzasz jedną osobę i dowiadujesz się, czy należy do mafii.', mieszkaniec: 'Obserwuj, dyskutuj i pomóż miastu usunąć mafię podczas głosowania.' };
    $('#game-message').textContent = room.role === 'host' ? 'Każdy gracz widzi swoją rolę wyłącznie na własnym telefonie.' : descriptions[room.my_role];
    $('#advance-game').textContent = 'Rozpocznij noc →';
  } else if (room.phase === 'mafia_night') {
    $('#game-round').textContent = `MAFIA / NOC ${room.day}`; $('#game-timer').textContent = '☾';
    $('#question-text').textContent = 'Miasto zasypia.';
    if (room.role === 'host') $('#game-message').textContent = `Nocne akcje: ${room.actions_done} z ${room.actions_required}.`;
    else if (!room.my_alive) $('#game-message').textContent = 'Nie żyjesz. Obserwuj dalszy przebieg gry.';
    else if (room.my_role === 'mieszkaniec') $('#game-message').textContent = 'Śpisz. Poczekaj, aż role nocne wykonają swoje akcje.';
    else {
      const mafiaIds = new Set(room.mafia_team.map(p => p.id));
      const targets = room.players.filter(p => p.alive && p.id !== room.me && (room.my_role !== 'mafia' || !mafiaIds.has(p.id)));
      setTargets(targets, room.my_role === 'mafia' ? 'Cel mafii' : 'Sprawdź');
      $('#game-message').textContent = me?.acted ? 'Twój wybór został zapisany.' : room.my_role === 'mafia' ? 'Wybierzcie osobę, która odpadnie tej nocy.' : 'Wybierz osobę, którą chcesz sprawdzić.';
    }
    $('#advance-game').textContent = 'Zakończ noc →';
  } else if (room.phase === 'mafia_day') {
    $('#game-round').textContent = `MAFIA / DZIEŃ ${room.day} / WYPOWIEDŹ ${room.speaker.number} Z ${room.speaker.total}`; $('#game-timer').textContent = room.seconds_left;
    $('#question-text').textContent = `Głos ma ${room.speaker.name}.`;
    const ownTurn = room.speaker.id === room.me ? ' To twoja minuta — przedstaw argumenty.' : '';
    $('#game-message').textContent = `${room.event || ''} ${room.private_message || 'Słuchajcie uważnie i szukajcie sprzeczności.'}${ownTurn}`.trim();
    $('#advance-game').textContent = room.speaker.last ? 'Rozpocznij głosowanie →' : 'Następna osoba →';
  } else if (room.phase === 'mafia_vote') {
    $('#game-round').textContent = `MAFIA / GŁOSOWANIE ${room.day}`; $('#game-timer').textContent = '●';
    $('#question-text').textContent = 'Kto należy do mafii?';
    if (room.role === 'host') $('#game-message').textContent = `Oddane głosy: ${room.actions_done} z ${room.actions_required}.`;
    else if (!room.my_alive) $('#game-message').textContent = 'Nie żyjesz i nie bierzesz udziału w głosowaniu.';
    else { setTargets(room.players.filter(p => p.alive && p.id !== room.me), 'Głos na'); $('#game-message').textContent = me?.acted ? 'Głos został zapisany.' : 'Wskaż jedną podejrzaną osobę.'; }
    $('#advance-game').textContent = 'Policz głosy →';
  } else {
    $('#game-round').textContent = 'MAFIA / KONIEC GRY'; $('#game-timer').textContent = '✓';
    $('#question-text').textContent = room.winner === 'mafia' ? 'Mafia przejmuje miasto.' : 'Miasto wygrywa!';
    $('#game-message').textContent = `${room.event || ''} Role wszystkich graczy są widoczne w zestawieniu.`.trim();
  }
}

function renderTokyo(room) {
  $('#lobby').hidden = true; $('#game').hidden = false;
  $('.scoreboard h2').textContent = 'Tokio'; $('#question-panel').classList.remove('category-stage'); $('#game-code').textContent = room.code;
  const roles = { oyabun: 'Oyabun', kyodai: 'Kyodai', shinogi: 'Shinogi-ya', keiji: 'Keiji', kaicho: 'Kaicho', maiko: 'Maiko', ronin: 'Ronin', shimin: 'Obywatel' };
  const cards = { yubitsume: 'Yubitsume', sake: 'Buteleczka Sake', list: 'List Pożegnalny', katana: 'Miecz Katana' };
  const me = room.players.find(player => player.id === room.me);
  $('#scoreboard').replaceChildren(...room.players.map(player => {
    const item = document.createElement('li'); item.className = `${player.alive ? '' : 'is-dead'}${room.speaker?.id === player.id ? ' is-speaking' : ''}`.trim();
    item.append(document.createTextNode(player.name)); const state = document.createElement('span');
    state.textContent = room.phase === 'tokyo_finished' ? roles[player.role] : player.silenced ? 'milczy' : player.alive ? 'w grze' : 'odpada'; item.append(state); return item;
  }));
  $('#finish-room').hidden = false; $('#finish-room').textContent = room.role === 'host' ? 'Zakończ grę' : 'Opuść grę';
  $('#advance-game').hidden = room.role !== 'host' || room.phase === 'tokyo_finished';
  $('#advance-game').disabled = busy || (['tokyo_night', 'tokyo_vote'].includes(room.phase) && room.actions_done < room.actions_required);
  $('#game-answers').replaceChildren();
  const addTargets = (players, label, kind = 'role') => {
    const heading = document.createElement('p'); heading.className = 'action-label'; heading.textContent = label; $('#game-answers').append(heading);
    players.forEach(player => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'game-answer mafia-target';
    const mark = document.createElement('b'); mark.textContent = player.name[0].toUpperCase(); button.append(mark, document.createTextNode(player.name));
      button.disabled = busy; button.onclick = () => submitTokyo(kind, player.id); button.setAttribute('aria-label', `${label}: ${player.name}`); $('#game-answers').append(button);
    });
  };
  const addFarewell = () => {
    if (room.role === 'host' || room.my_card !== 'list' || room.card_used || !room.my_alive) return;
    const input = document.createElement('textarea'); input.id = 'farewell-message'; input.maxLength = 160; input.placeholder = 'Napisz ostatnią wiadomość…'; input.setAttribute('aria-label', 'Treść Listu Pożegnalnego');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.textContent = 'Zapieczętuj list'; button.onclick = () => submitTokyo('farewell', null, input.value);
    $('#game-answers').append(input, button);
  };
  if (room.phase === 'tokyo_intro') {
    $('#game-round').textContent = 'TOKYO / TAJNE ROLE'; $('#game-timer').textContent = '夜';
    $('#question-text').textContent = room.role === 'host' ? 'Role i karty zostały rozdane.' : `Jesteś: ${roles[room.my_role]}`;
    const roleHelp = { oyabun: 'Co noc wskazujesz cel wyroku.', kyodai: 'Wspierasz klan i przejmujesz dowodzenie po śmierci Oyabuna.', shinogi: 'Co noc odbierasz wybranej osobie prawo głosu w dyskusji.', keiji: 'Co noc sprawdzasz, czy wybrana osoba należy do Yakuzy.', kaicho: 'Twój głos podczas linczu liczy się podwójnie.', maiko: 'Co noc blokujesz akcję wybranej osoby.', ronin: 'Wybierasz rywala. Wygrywasz dodatkowo, gdy on zginie lub gdy przeżyjesz do końca.', shimin: 'Obserwuj, rozmawiaj i pomóż oczyścić Tokio.' };
    const cardHelp = { yubitsume: 'może raz ocalić cię przed dziennym wyrokiem', sake: 'może raz ochronić wybraną osobę przed nocnym atakiem', list: 'pozwala zostawić wiadomość ujawnioną po twojej śmierci', katana: 'dwie Katany wskazane na ten sam cel zabijają go przed świtem' };
    const team = room.yakuza_team?.length ? ` Twój klan: ${room.yakuza_team.map(p => `${p.name} (${roles[p.role]})`).join(', ')}.` : '';
    $('#game-message').textContent = room.role === 'host' ? 'Każdy poznaje na telefonie własną rolę i jednorazową kartę.' : `${roleHelp[room.my_role]} Karta ${cards[room.my_card]} ${cardHelp[room.my_card]}.${team}`;
    addFarewell(); $('#advance-game').textContent = 'Rozpocznij noc →';
  } else if (room.phase === 'tokyo_night') {
    $('#game-round').textContent = `TOKYO / NOC ${room.day}`; $('#game-timer').textContent = '☾'; $('#question-text').textContent = 'Neony nad Tokio gasną.';
    if (room.role === 'host') $('#game-message').textContent = `Obowiązkowe akcje: ${room.actions_done} z ${room.actions_required}.`;
    else if (!room.my_alive) $('#game-message').textContent = 'Nie żyjesz. Obserwuj tokijskie podziemie.';
    else {
      const needsRoleAction = ['oyabun','shinogi','keiji','maiko'].includes(room.my_role) || (room.my_role === 'ronin' && !room.ronin_rival);
      if (needsRoleAction && !me?.acted) {
        const yakuza = new Set(room.yakuza_team?.map(p => p.id));
        const targets = room.players.filter(p => p.alive && p.id !== room.me && (room.my_role !== 'oyabun' || !yakuza.has(p.id)));
        const actionLabels = { oyabun: 'Wskaż cel wyroku', shinogi: 'Kup milczenie', keiji: 'Sprawdź przeszłość', maiko: 'Zablokuj akcję', ronin: 'Wybierz rywala' };
        addTargets(targets, actionLabels[room.my_role]);
      }
      if (!room.card_used && ['sake','katana'].includes(room.my_card)) addTargets(room.players.filter(p => p.alive), cards[room.my_card], room.my_card);
      $('#game-message').textContent = me?.acted ? 'Akcja roli zapisana. Możesz jeszcze użyć karty, jeśli ją posiadasz.' : needsRoleAction ? 'Wybierz cel swojej nocnej akcji.' : 'Nie masz obowiązkowej akcji tej nocy.';
    }
    $('#advance-game').textContent = 'Odsłoń poranek →';
  } else if (room.phase === 'tokyo_day') {
    $('#game-round').textContent = `TOKYO / DZIEŃ ${room.day} / WYPOWIEDŹ ${room.speaker.number} Z ${room.speaker.total}`; $('#game-timer').textContent = room.seconds_left;
    $('#question-text').textContent = `Głos ma ${room.speaker.name}.`;
    $('#game-message').textContent = `${room.event || ''} ${room.private_message || ''}${room.silenced ? ' Shinogi-ya kupił twoje milczenie — dziś nie zabierasz głosu.' : room.speaker.id === room.me ? ' To twoja minuta.' : ''}`.trim();
    addFarewell(); $('#advance-game').textContent = room.speaker.last ? 'Rozpocznij głosowanie →' : 'Następna osoba →';
  } else if (room.phase === 'tokyo_vote') {
    $('#game-round').textContent = `TOKYO / GŁOSOWANIE ${room.day}`; $('#game-timer').textContent = '判'; $('#question-text').textContent = 'Kto zdradził Tokio?';
    if (room.role === 'host') $('#game-message').textContent = `Oddane głosy: ${room.actions_done} z ${room.actions_required}. Głos Kaicho liczy się podwójnie.`;
    else if (room.my_alive) { if (!me?.acted) addTargets(room.players.filter(p => p.alive && p.id !== room.me), 'Głos na', 'vote'); $('#game-message').textContent = me?.acted ? 'Głos zapisany.' : 'Wskaż oskarżonego.'; }
    else $('#game-message').textContent = 'Nie bierzesz udziału w głosowaniu.';
    $('#advance-game').textContent = 'Policz głosy →';
  } else if (room.phase === 'tokyo_defense') {
    const accused = room.players.find(p => p.id === room.defense_target); $('#game-round').textContent = 'TOKYO / YUBITSUME'; $('#game-timer').textContent = '指'; $('#question-text').textContent = `${accused?.name} może okazać skruchę.`;
    $('#game-message').textContent = room.role === 'host' ? 'Poczekaj na decyzję oskarżonego albo wykonaj wyrok.' : room.me === room.defense_target ? 'Użyj Yubitsume, aby ocalić się w tej turze.' : 'Oskarżony podejmuje decyzję.';
    if (room.me === room.defense_target) { const button = document.createElement('button'); button.className = 'primary'; button.textContent = 'Używam Yubitsume'; button.onclick = () => submitTokyo('yubitsume'); $('#game-answers').append(button); }
    $('#advance-game').textContent = 'Wykonaj wyrok →';
  } else {
    $('#game-round').textContent = 'TOKYO / KONIEC GRY'; $('#game-timer').textContent = '終';
    const ronin = room.players.find(p => p.ronin_won); $('#question-text').textContent = room.winner === 'yakuza' ? 'Klan Yakuzy przejmuje Tokio.' : 'Policja oczyszcza ulice.';
    $('#game-message').textContent = `${room.event || ''}${ronin ? ` Ronin ${ronin.name} także wypełnił swój cel.` : ''} Role zostały ujawnione.`.trim();
  }
}
const BRUDNE_CARD_NAMES = { '5050': '50/50', steal: 'Kradzież Piorunem', gamble: 'Podwójna Stawka', freeze: 'Blokada Czasu', audit: 'Audyt Publiczności' };
function renderBrudne(room) {
  $('#lobby').hidden = true; $('#game').hidden = false;
  $('.scoreboard h2').textContent = 'Ranking'; $('#game-code').textContent = room.code;
  const me = room.players.find(p => p.id === room.me);
  $('#scoreboard').replaceChildren(...room.players.map(player => {
    const item = document.createElement('li'); item.className = player.alive ? '' : 'is-dead';
    item.append(document.createTextNode(player.name));
    const score = document.createElement('span');
    score.textContent = room.stage === 3 ? `${'♥'.repeat(player.lives)}${'♡'.repeat(3 - player.lives)} · ${player.score} pkt` : `${player.score} pkt`;
    item.append(score); return item;
  }));
  $('#finish-room').hidden = false;
  $('#finish-room').textContent = room.role === 'host' ? 'Zakończ grę' : 'Opuść grę';
  $('#game-answers').replaceChildren();
  if (room.phase === 'brudne_finished') {
    $('#question-panel').classList.remove('category-stage');
    $('#game-round').textContent = 'BRUDNE ZAGRYWKI / KONIEC GRY'; $('#game-timer').textContent = '✓';
    $('#question-text').textContent = room.winner ? `Zwycięzca: ${room.winner}!` : 'Koniec gry';
    $('#game-message').textContent = 'Wynik końcowy uwzględnia punkty z Tur I–II oraz +1000 za każde ocalałe serce z Tury III.';
    $('#advance-game').hidden = true;
    document.body.classList.add('brudne-victory');
    return;
  }
  document.body.classList.remove('brudne-victory');
  $('#advance-game').hidden = room.role !== 'host';
  const stageLabel = room.stage === 1 ? 'TURA I: WYŚCIG Z CZASEM' : room.stage === 2 ? 'TURA II: KRĄG OGNIA' : 'TURA III: BITWA O PRZETRWANIE';
  const canAct = room.stage === 1 || room.is_spotlight;
  if (room.phase === 'brudne_pick') {
    $('#question-panel').classList.remove('category-stage');
    $('#game-round').textContent = `BRUDNE ZAGRYWKI / ${stageLabel} / WSKAŻ OFIARĘ`; $('#game-timer').textContent = room.seconds_left;
    $('#question-text').textContent = 'Kto ma odpowiedzieć na następne pytanie?';
    if (room.role !== 'host' && room.my_alive) {
      room.players.filter(p => p.alive && p.id !== room.me).forEach(player => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'game-answer mafia-target';
        const mark = document.createElement('b'); mark.textContent = player.name[0].toUpperCase();
        button.append(mark, document.createTextNode(player.name));
        button.disabled = busy; button.onclick = () => submitBrudne('vote', { target: player.id });
        $('#game-answers').append(button);
      });
    }
    $('#game-message').textContent = room.role === 'host' ? `Wskazania: ${room.actions_done} z ${room.actions_required}.` : !room.my_alive ? 'Odpadłeś z gry. Obserwuj dalszy przebieg.' : 'Wskaż osobę, która zmierzy się z pytaniem.';
    $('#advance-game').disabled = busy || room.actions_done < room.actions_required; $('#advance-game').textContent = 'Ujawnij ofiarę →';
    return;
  }
  const question = room.question;
  if (room.phase === 'brudne_category') {
    $('#question-panel').classList.add('category-stage');
    $('#game-round').textContent = `BRUDNE ZAGRYWKI / ${stageLabel} / PYTANIE ${question.number} Z ${question.total}`; $('#game-timer').textContent = room.seconds_left;
    $('#question-text').textContent = room.stage >= 2 ? `${question.category} — kolej na ${room.spotlight_name}!` : question.category;
    if (room.role !== 'host' && room.my_alive) {
      Object.entries(room.my_cards || {}).filter(([, count]) => count > 0).forEach(([card]) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary brudne-card';
        button.textContent = `${BRUDNE_CARD_NAMES[card]} (${room.my_cards[card]})`;
        button.disabled = busy || !!room.card_played || (['5050', 'gamble'].includes(card) && !canAct);
        button.onclick = () => {
          if (['steal', 'freeze'].includes(card)) {
            $('#game-answers').replaceChildren(...room.players.filter(p => p.alive && p.id !== room.me).map(player => {
              const target = document.createElement('button'); target.type = 'button'; target.className = 'game-answer mafia-target';
              const mark = document.createElement('b'); mark.textContent = player.name[0].toUpperCase();
              target.append(mark, document.createTextNode(player.name));
              target.onclick = () => submitBrudne('card', { card, target: player.id });
              return target;
            }));
          } else submitBrudne('card', { card });
        };
        $('#game-answers').append(button);
      });
    }
    $('#game-message').textContent = room.card_played ? `Zagrałeś: ${BRUDNE_CARD_NAMES[room.card_played]}.` : 'Możesz teraz zagrać kartę mocy, zanim pojawi się pytanie.';
    $('#advance-game').disabled = false; $('#advance-game').textContent = 'Pokaż pytanie →';
    return;
  }
  $('#question-panel').classList.remove('category-stage');
  $('#game-round').textContent = `BRUDNE ZAGRYWKI / ${stageLabel} / PYTANIE ${question.number} Z ${question.total}`;
  $('#game-timer').textContent = room.phase === 'brudne_question' ? room.seconds_left : '0';
  $('#question-text').textContent = question.text;
  const hidden = new Set(room.hidden_answers || []);
  question.answers.forEach((answer, index) => {
    if (hidden.has(index)) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'game-answer'; button.dataset.answer = index;
    const mark = document.createElement('b'); mark.textContent = 'ABCD'[index];
    button.append(mark, document.createTextNode(answer));
    if (me?.answer === index) button.classList.add('is-picked');
    if (room.phase === 'brudne_reveal' && index === question.correct) button.classList.add('is-correct');
    if (room.phase === 'brudne_reveal' && me?.answer === index && index !== question.correct) button.classList.add('is-wrong');
    button.disabled = room.role === 'host' || room.phase !== 'brudne_question' || !canAct || me?.answered || busy;
    button.onclick = () => submitBrudne('answer', { answer: index });
    $('#game-answers').append(button);
  });
  if (room.audit) {
    const tally = document.createElement('p'); tally.className = 'action-label';
    tally.textContent = `Audyt: ${['A', 'B', 'C', 'D'].map((letter, index) => `${letter}: ${room.audit[index] || 0}`).join(' · ')}`;
    $('#game-answers').append(tally);
  }
  if (room.phase === 'brudne_reveal') $('#game-message').textContent = question.explanation;
  else if (room.role === 'host') $('#game-message').textContent = room.stage === 1 ? `Odpowiedziało ${room.players.filter(p => p.answered).length} z ${room.players.length} graczy.` : `Odpowiada: ${room.spotlight_name}.`;
  else if (!canAct) $('#game-message').textContent = `Odpowiada teraz ${room.spotlight_name}. Obserwuj.`;
  else $('#game-message').textContent = me?.answered ? 'Odpowiedź zapisana.' : 'Wybierz odpowiedź na swoim telefonie.';
  $('#advance-game').disabled = busy || (room.phase === 'brudne_question' && room.seconds_left > 0 && (room.stage === 1 ? room.players.filter(p => p.answered).length < room.players.filter(p => p.online).length : !room.players.some(p => p.answered)));
  $('#advance-game').textContent = room.phase === 'brudne_reveal' ? (question.number === question.total ? 'Zakończ grę →' : 'Następne pytanie →') : 'Pokaż odpowiedź →';
}
async function submitBrudne(kind, body = {}) {
  if (busy || !snapshot || snapshot.role === 'host') return;
  busy = true; render(snapshot);
  try { await api(`rooms/${session.code}/answer`, { kind, ...body }); showError(); }
  catch (error) { showError(error.message); }
  finally { busy = false; await poll(); }
}
async function poll() {
  clearTimeout(timer);
  if (!session || polling) return;
  polling = true;
  const current = session;
  try {
    const room = await api(`rooms/${current.code}`, undefined, current.token);
    if (session !== current) return;
    render(room); showError();
  } catch (error) {
    if (session !== current) return;
    if ([401, 404].includes(error.status)) reset();
    else { $('#connection').textContent = 'Ponawiam połączenie…'; $('#ready-button').disabled = true; }
    showError(error.message);
  } finally {
    polling = false;
    if (session) timer = setTimeout(poll, ['category','question','mafia_night','mafia_day','mafia_vote','tokyo_night','tokyo_day','tokyo_vote','tokyo_defense','brudne_pick','brudne_category','brudne_question'].includes(snapshot?.phase) ? 1000 : 2000);
  }
}
function reset() {
  clearTimeout(timer); saveSession(null); snapshot = null;
  $('#lobby').hidden = true; $('#game').hidden = true; $('#setup').hidden = false;
  $('#close-confirm').hidden = true;
  $('#room-notice').textContent = '';
}
$('#start-game').onclick = async () => {
  if (busy || !snapshot) return;
  busy = true;
  try { await api(`rooms/${session.code}/start`, {}); showError(); }
  catch (error) { showError(error.message); }
  finally { busy = false; await poll(); }
};
async function submitAnswer(answer) {
  if (busy || !snapshot || snapshot.role === 'host') return;
  busy = true; render(snapshot);
  try { await api(`rooms/${session.code}/answer`, { answer }); showError(); }
  catch (error) { showError(error.message); }
  finally { busy = false; await poll(); }
}
async function submitMafiaTarget(target) {
  if (busy || !snapshot || snapshot.role === 'host') return;
  busy = true; render(snapshot);
  try { await api(`rooms/${session.code}/answer`, { target }); showError(); }
  catch (error) { showError(error.message); }
  finally { busy = false; await poll(); }
}
async function submitTokyo(kind, target = null, message = null) {
  if (busy || !snapshot || snapshot.role === 'host') return;
  busy = true; render(snapshot);
  try { await api(`rooms/${session.code}/answer`, { kind, target, message }); showError(); }
  catch (error) { showError(error.message); }
  finally { busy = false; await poll(); }
}
$('#advance-game').onclick = async () => {
  if (busy || !snapshot || snapshot.role !== 'host') return;
  busy = true; $('#advance-game').disabled = true;
  try { await api(`rooms/${session.code}/advance`, {}); showError(); }
  catch (error) { showError(error.message); }
  finally { busy = false; await poll(); }
};
$('#finish-room').onclick = () => {
  if (session.role === 'host' && !confirm('Zakończyć grę i odłączyć wszystkich graczy?')) return;
  leave();
};
$('#ready-button').onclick = async () => {
  if (busy || !snapshot) return;
  busy = true; $('#ready-button').disabled = true;
  try {
    const me = snapshot.players.find(p => p.id === snapshot.me);
    await api(`rooms/${session.code}/ready`, { ready: !me.ready });
    showError();
  } catch (error) { showError(error.message); }
  finally { busy = false; await poll(); }
};
async function leave() {
  if (busy) return;
  busy = true;
  try { await api(`rooms/${session.code}/${session.role === 'host' ? 'close' : 'leave'}`, {}); reset(); showError(); }
  catch (error) { showError(error.message); }
  finally { busy = false; }
}
$('#leave-room').onclick = () => {
  if (session.role === 'host') { $('#close-confirm').hidden = false; $('#confirm-close').focus(); }
  else leave();
};
$('#confirm-close').onclick = leave;
$('#cancel-close').onclick = () => { $('#close-confirm').hidden = true; $('#leave-room').focus(); };
if (session) enterLobby();
