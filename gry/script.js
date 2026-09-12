const dialog = document.querySelector('#game-dialog');
const view = document.querySelector('#game-view');
const questions = [
  { text: 'Która planeta w Układzie Słonecznym jest największa?', answers: ['Mars', 'Jowisz', 'Saturn', 'Neptun'], correct: 1, note: 'Jowisz jest największą planetą Układu Słonecznego.' },
  { text: 'Ile boków ma sześciokąt?', answers: ['Pięć', 'Osiem', 'Sześć', 'Dwanaście'], correct: 2, note: 'Sześciokąt ma sześć boków i sześć wierzchołków.' },
  { text: 'Kto napisał „Lalkę”?', answers: ['Bolesław Prus', 'Henryk Sienkiewicz', 'Adam Mickiewicz', 'Juliusz Słowacki'], correct: 0, note: 'Autorem „Lalki” jest Bolesław Prus.' }
];
let questionIndex = 0;
let score = 0;
let answered = false;
let phaseIndex = 0;
const banner = '<div class="demo-banner">Podgląd na jednym ekranie · telefony nie są jeszcze połączone</div>';

function showSetup(game) {
  const mafia = game === 'mafia';
  view.innerHTML = `${banner}<h2 id="dialog-title">${mafia ? 'Miasto czeka na was.' : 'Gramy o milion?'}</h2><p>${mafia ? 'Rozmowy, blef i tajne role. Zobacz, jak mógłby wyglądać wspólny ekran Mafii.' : 'Sprawdź przykładową rundę z trzema pytaniami. W tym podglądzie odpowiedzi wybierasz na ekranie.'}</p><ul class="rules">${mafia ? '<li>Telefon pokaże każdemu jego tajną rolę.</li><li>Nocą mafia wybierze cel, a miasto zaśnie.</li><li>Za dnia przyjdzie czas na dyskusję i głosowanie.</li>' : '<li>Każde pytanie ma cztery możliwe odpowiedzi.</li><li>Wybierz jedną i sprawdź, czy masz rację.</li><li>Na końcu zobaczysz swój wynik.</li>'}</ul><button class="primary" id="start-demo">${mafia ? 'Zobacz przebieg rundy' : 'Zagraj w próbny quiz'} <span aria-hidden="true">→</span></button>`;
  document.querySelector('#start-demo').onclick = () => {
    questionIndex = 0; score = 0; phaseIndex = 0;
    if (mafia) renderPhase(); else renderQuestion();
    focusTitle();
  };
  if (!mafia) view.insertAdjacentHTML('beforeend', '<a class="primary" href="room.html?game=quiz&mode=host">Utwórz wspólny pokój <span aria-hidden="true">→</span></a><a class="room-join-link" href="room.html?game=quiz">Mam kod — dołączam</a>');
  dialog.showModal();
}

function focusTitle() {
  const title = document.querySelector('#dialog-title');
  title.tabIndex = -1;
  title.focus();
}

function renderQuestion() {
  answered = false;
  const question = questions[questionIndex];
  view.innerHTML = `${banner}<p class="round">MILIONERZY / PYTANIE ${questionIndex + 1} Z ${questions.length}</p><h2 id="dialog-title">${question.text}</h2><div class="answers">${question.answers.map((answer, index) => `<button class="answer" data-answer="${index}"><b>${'ABCD'[index]}</b> ${answer}</button>`).join('')}</div><p class="feedback" role="status" aria-live="polite">Wybierz jedną odpowiedź.</p><button class="primary" id="next-question" hidden>${questionIndex === questions.length - 1 ? 'Zobacz wynik' : 'Następne pytanie'} <span aria-hidden="true">→</span></button>`;
  // ponytail: lokalny quiz pokazowy; wspólny serwer będzie rozstrzygał odpowiedzi w grze sieciowej.
  view.querySelectorAll('[data-answer]').forEach(button => {
    button.onclick = () => {
      if (answered) return;
      answered = true;
      const correct = Number(button.dataset.answer) === question.correct;
      if (correct) score++;
      view.querySelectorAll('[data-answer]').forEach(answer => {
        answer.disabled = true;
        if (Number(answer.dataset.answer) === question.correct) answer.classList.add('correct');
      });
      if (!correct) button.classList.add('wrong');
      view.querySelector('.feedback').textContent = `${correct ? 'Dobra odpowiedź!' : 'Tym razem nie.'} ${question.note}`;
      const next = document.querySelector('#next-question');
      next.hidden = false;
      next.focus();
    };
  });
  document.querySelector('#next-question').onclick = () => {
    if (!answered) return;
    questionIndex++;
    if (questionIndex < questions.length) renderQuestion(); else renderResult();
    focusTitle();
  };
}

function renderResult() {
  view.innerHTML = `${banner}<p class="round">MILIONERZY / KONIEC PODGLĄDU</p><h2 id="dialog-title">${score === questions.length ? 'Komplet! Brawo.' : 'Dzięki za rundę!'}</h2><div class="result-score">${score}<span> / ${questions.length}</span></div><p>Poprawne odpowiedzi w przykładowym quizie. Pełna gra otrzyma drabinkę nagród, koła ratunkowe i wspólną rozgrywkę.</p><button class="primary" id="play-again">Zagraj jeszcze raz <span aria-hidden="true">↻</span></button>`;
  document.querySelector('#play-again').onclick = () => { questionIndex = 0; score = 0; renderQuestion(); focusTitle(); };
}

function renderPhase() {
  const phases = [
    ['01 / NOC', 'Miasto zasypia.', 'W pełnej grze każdy sprawdzi swoją rolę na telefonie. Mafia dyskretnie wybierze cel, a pozostali wykonają akcje swoich ról.', 'Przejdź do poranka'],
    ['02 / PORANEK', 'Kogoś brakuje przy stole.', 'Wynik nocnych akcji pojawi się na wspólnym ekranie. Na razie to pokaz przebiegu — nie wylosowano ról ani ofiary.', 'Czas na dyskusję'],
    ['03 / DYSKUSJA', 'Komu wierzycie?', 'To wasz moment. Porównajcie alibi, zadawajcie pytania i obserwujcie reakcje. Kto próbuje odwrócić uwagę?', 'Przejdź do głosowania'],
    ['04 / GŁOSOWANIE', 'Miasto podejmuje decyzję.', 'Każdy wybierze podejrzaną osobę na telefonie. Wspólny ekran pokaże wynik głosowania i rozpocznie kolejną noc.', 'Powtórz podgląd rundy']
  ];
  const phase = phases[phaseIndex];
  view.innerHTML = `${banner}<p class="round">MAFIA / ${phase[0]}</p><h2 id="dialog-title">${phase[1]}</h2><div class="phase-card"><h3>${phaseIndex === 0 ? 'Cisza. Trwa noc.' : phaseIndex === 1 ? 'Miasto się budzi.' : phaseIndex === 2 ? 'Każde słowo ma znaczenie.' : 'Jeden głos może zmienić wszystko.'}</h3><p>${phase[2]}</p></div><button class="primary" id="next-phase">${phase[3]} <span aria-hidden="true">→</span></button>`;
  document.querySelector('#next-phase').onclick = () => { phaseIndex = (phaseIndex + 1) % phases.length; renderPhase(); focusTitle(); };
}

document.querySelectorAll('[data-game]').forEach(button => button.addEventListener('click', () => showSetup(button.dataset.game)));
document.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
});


