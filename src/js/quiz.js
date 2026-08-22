/**
 * quiz.js - Lógica para Tests Generados por IA con integración FSRS
 * Dificultades: Recluta, Curtido, Veterano (Estilo MW2)
 */

import { getProviderConfig, generateContent } from './ai.js';
import { updateCardFSRS, getCardById } from './storage.js'; // Asumiendo que estas funciones existen en storage

// Configuración de dificultades estilo MW2
const DIFFICULTIES = {
    recluta: { label: 'Recluta', icon: 'fa-solid fa-user-shield', color: '#4caf50', desc: 'Preguntas directas sobre conceptos básicos.' },
    curtido: { label: 'Curtido', icon: 'fa-solid fa-user-ninja', color: '#ff9800', desc: 'Preguntas que requieren comprensión y relación de ideas.' },
    veterano: { label: 'Veterano', icon: 'fa-solid fa-skull', color: '#f44336', desc: 'Preguntas complejas, casos prácticos o detalles oscuros.' }
};

let currentQuizState = null;

/**
 * Inicializa la vista del Quiz
 */
export function initQuizView() {
    const container = document.getElementById('quiz-container');
    if (!container) return;

    container.innerHTML = `
        <div class="quiz-setup card">
            <h2><i class="fa-solid fa-clipboard-question"></i> Tipo Test</h2>
            <p>Genera un examen automático basado en tus apuntes actuales.</p>
            
            <div class="quiz-options">
                <div class="form-group">
                    <label>Número de preguntas:</label>
                    <input type="number" id="quiz-count" value="5" min="1" max="20">
                </div>
                
                <div class="form-group">
                    <label>Dificultad:</label>
                    <div class="difficulty-selector">
                        ${Object.entries(DIFFICULTIES).map(([key, val]) => `
                            <button class="diff-btn ${key === 'curtido' ? 'active' : ''}" 
                                    data-diff="${key}" 
                                    style="--diff-color: ${val.color}">
                                <i class="${val.icon}"></i>
                                <span>${val.label}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>

            <button id="btn-start-quiz" class="btn-primary">
                <i class="fa-solid fa-crosshairs"></i> Iniciar Misión
            </button>
        </div>

        <div id="quiz-loading" class="quiz-loading hidden">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <p>Desplegando preguntas...</p>
        </div>

        <div id="quiz-game" class="quiz-game hidden">
            <div class="quiz-header">
                <div class="progress-bar"><div id="quiz-progress" style="width: 0%"></div></div>
                <div class="quiz-stats">
                    <span id="quiz-question-count">1/5</span>
                </div>
            </div>
            
            <div class="question-card">
                <h3 id="question-text">Pregunta...</h3>
                <div id="options-container" class="options-grid">
                    <!-- Opciones generadas -->
                </div>
            </div>
        </div>

        <div id="quiz-results" class="quiz-results hidden">
            <h2>Misión Cumplida</h2>
            <div class="score-display">
                <div class="score-circle">
                    <span id="final-score">0%</span>
                </div>
                <p id="feedback-msg">Buen trabajo, soldado.</p>
            </div>
            <div id="results-detail"></div>
            <button id="btn-close-quiz" class="btn-secondary">Volver a Base</button>
        </div>
    `;

    setupQuizListeners();
}

function setupQuizListeners() {
    // Selector de dificultad
    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
        });
    });

    // Iniciar Quiz
    document.getElementById('btn-start-quiz')?.addEventListener('click', startQuiz);
    
    // Cerrar Resultados
    document.getElementById('btn-close-quiz')?.addEventListener('click', () => {
        document.getElementById('quiz-results').classList.add('hidden');
        document.getElementById('quiz-setup').classList.remove('hidden');
        currentQuizState = null;
    });
}

async function startQuiz() {
    const count = parseInt(document.getElementById('quiz-count').value) || 5;
    const difficultyKey = document.querySelector('.diff-btn.active').dataset.diff;
    const difficulty = DIFFICULTIES[difficultyKey];
    
    // Obtener contexto actual (asignatura activa)
    // Asumimos que hay una forma de obtener los apuntes activos. 
    // Si no, pedimos al usuario que seleccione una carpeta primero.
    const activeNotes = window.getActiveNotesContext ? window.getActiveNotesContext() : [];
    
    if (activeNotes.length === 0) {
        alert("Selecciona una asignatura o carpeta con apuntes primero.");
        return;
    }

    // UI Loading
    document.querySelector('.quiz-setup').classList.add('hidden');
    document.getElementById('quiz-loading').classList.remove('hidden');

    const contextText = activeNotes.map(n => `${n.title}: ${n.content}`).join('\n\n');
    
    const prompt = `
Eres un examinador militar experto. Genera un test de ${count} preguntas basado en el siguiente texto.
Nivel de dificultad: ${difficulty.label.toUpperCase()}.
${difficulty.desc}

Formato de salida estrictamente JSON (sin markdown, sin texto extra):
{
    "questions": [
        {
            "id": 1,
            "question": "Texto de la pregunta",
            "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
            "correctIndex": 0, // Índice de la respuesta correcta (0-3)
            "conceptRef": "palabra clave del concepto evaluado"
        }
    ]
}

Texto base:
${contextText.substring(0, 15000)} // Limitar tokens para no saturar
`;

    try {
        const response = await generateContent(prompt, { temperature: 0.7 });
        // Limpieza básica por si la IA añade markdown
        const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
        const quizData = JSON.parse(cleanJson);
        
        runQuizGame(quizData.questions, difficulty);
    } catch (error) {
        console.error("Error generando quiz:", error);
        alert("Error al generar el test. Verifica tu conexión o API Key.");
        document.getElementById('quiz-loading').classList.add('hidden');
        document.querySelector('.quiz-setup').classList.remove('hidden');
    }
}

function runQuizGame(questions, difficulty) {
    document.getElementById('quiz-loading').classList.add('hidden');
    document.getElementById('quiz-game').classList.remove('hidden');
    
    currentQuizState = {
        questions: questions,
        currentIndex: 0,
        score: 0,
        results: [],
        difficulty: difficulty
    };

    renderQuestion();
}

function renderQuestion() {
    const { questions, currentIndex } = currentQuizState;
    const q = questions[currentIndex];
    
    document.getElementById('quiz-question-count').textContent = `${currentIndex + 1}/${questions.length}`;
    document.getElementById('quiz-progress').style.width = `${((currentIndex) / questions.length) * 100}%`;
    document.getElementById('question-text').textContent = q.question;
    
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    
    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span class="opt-letter">${String.fromCharCode(65 + idx)}</span> ${opt}`;
        btn.onclick = () => handleAnswer(idx);
        optionsContainer.appendChild(btn);
    });
}

function handleAnswer(selectedIndex) {
    const { questions, currentIndex, results } = currentQuizState;
    const q = questions[currentIndex];
    const isCorrect = selectedIndex === q.correctIndex;
    
    // Guardar resultado
    results.push({
        question: q,
        selected: selectedIndex,
        correct: isCorrect,
        concept: q.conceptRef
    });

    if (isCorrect) currentQuizState.score++;

    // Siguiente pregunta o finalizar
    if (currentIndex < questions.length - 1) {
        currentQuizState.currentIndex++;
        renderQuestion();
    } else {
        finishQuiz();
    }
}

function finishQuiz() {
    document.getElementById('quiz-game').classList.add('hidden');
    document.getElementById('quiz-results').classList.remove('hidden');
    
    const { score, questions, results, difficulty } = currentQuizState;
    const percentage = Math.round((score / questions.length) * 100);
    
    document.getElementById('final-score').textContent = `${percentage}%`;
    
    let msg = "";
    if (percentage === 100) msg = "¡Impecable! Nivel Dios.";
    else if (percentage >= 80) msg = "Buen trabajo, Soldado.";
    else if (percentage >= 50) msg = "Aprobado, pero puedes mejorar.";
    else msg = "Necesitas entrenamiento adicional.";
    
    document.getElementById('feedback-msg').textContent = msg;

    // Procesar FSRS
    processFSRSUpdates(results, difficulty);
    
    renderResultsDetail(results);
}

function processFSRSUpdates(results, difficulty) {
    // Factores de ajuste según dificultad
    // Recluta: +0.1 (bien), -0.1 (mal)
    // Curtido: +0.2 (bien), -0.2 (mal)
    // Veterano: +0.3 (bien), -0.3 (mal)
    
    let factor = 0.1;
    if (difficulty.key === 'curtido') factor = 0.2;
    if (difficulty.key === 'veterano') factor = 0.3;

    results.forEach(res => {
        if (!res.concept) return;
        
        // Buscar la tarjeta asociada a este concepto en el almacenamiento local
        // Esto es pseudo-código, necesita adaptación a tu estructura real de storage
        const card = findCardByConcept(res.concept); 
        
        if (card) {
            if (res.correct) {
                // Acierto: Incrementar intervalo o facilidad
                updateCardFSRS(card.id, { rating: 4 }); // 4 = Again/Hard/Good/Easy -> Usamos Good/Easy
            } else {
                // Fallo: Resetear o reducir intervalo
                updateCardFSRS(card.id, { rating: 1 }); // 1 = Again
            }
        }
    });
}

// Función auxiliar simulada (debes conectarla con tu storage real)
function findCardByConcept(concept) {
    // Implementar lógica de búsqueda en tus tarjetas existentes
    // Ejemplo: buscar por título o etiqueta que coincida con 'concept'
    return window.findCardByTag ? window.findCardByTag(concept) : null;
}

function renderResultsDetail(results) {
    const container = document.getElementById('results-detail');
    container.innerHTML = results.map((r, i) => `
        <div class="result-item ${r.correct ? 'correct' : 'incorrect'}">
            <div class="res-header">
                <span>Pregunta ${i+1}</span>
                <i class="fa-solid ${r.correct ? 'fa-check' : 'fa-xmark'}"></i>
            </div>
            <p class="res-q">${r.question.question}</p>
            <p class="res-a">Tu respuesta: ${r.question.options[r.selected]}</p>
            ${!r.correct ? `<p class="res-correct">Correcta: ${r.question.options[r.question.correctIndex]}</p>` : ''}
        </div>
    `).join('');
}

// Exportar para uso global si es necesario
window.runQuiz = initQuizView;
