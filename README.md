# 📚 Estudiador Pro

**Versión actual de la aplicación:** `2.2.4` (definida en `src/js/app.js` → `APP_VERSION`)

Aplicación web de estudio **local-first** (sin servidor propio) que combina:

- 🔁 **Repetición espaciada** con el algoritmo **FSRS-6** (21 parámetros, curva de olvido personalizable).
- ⏱️ **Pomodoro** integrado con gestión de tareas y "hora estimada de fin".
- 🤖 **Tutor IA** (Groq y OpenRouter), generación de **mapas conceptuales** y **exámenes tipo test** con IA.
- 📊 **Dashboard de estadísticas**: mapas de calor, rachas, deuda de estudio, probabilidad de aprobado y simulaciones de Monte Carlo.
- 🗓️ **Planificador de exámenes** con agenda, fechas clave y horario semanal.
- 👥 **Sistema social** (amigos, solicitudes y compartir materiales) sobre Firebase.
- 🎨 Personalización total: temas, colores por asignatura, sonidos ambientales, modo pizarra, visor de PDF, etc.

Todo funciona abriendo `index.html` en el navegador: no hay compilación ni dependencias instaladas (los módulos JS se cargan como scripts clásicos en un orden concreto). La persistencia es local (localStorage + IndexedDB) y opcionalmente en la nube (Firebase/Firestore).

---

## 🧭 Índice

1. [Cómo ejecutar](#-cómo-ejecutar)
2. [Arquitectura general](#-arquitectura-general)
3. [Estructura del repositorio](#-estructura-del-repositorio)
4. [Descripción de archivos raíz](#descripción-de-archivos-raíz)
5. [`src/css` — Estilos](#srccss--estilos)
6. [`src/js` — Lógica de la aplicación](#srcjs--lógica-de-la-aplicación)
   - [Núcleo e infraestructura](#núcleo-e-infraestructura)
   - [Dominio y motor de estudio](#dominio-y-motor-de-estudio)
   - [Inteligencia artificial](#inteligencia-artificial)
   - [Nube, datos y telemetría](#nube-datos-y-telemetría)
   - [Productividad: Pomodoro, tareas y temporizador](#productividad-pomodoro-tareas-y-temporizador)
   - [Multimedia y extras](#multimedia-y-extras)
7. [`src/js/interfaz` — Módulos de UI](#srcjsinterfaz--módulos-de-ui)
8. [`assets/audio` — Sonidos](#assetsaudio--sonidos)
9. [`secretos/` — Backlog interno](#secretos--backlog-interno)
10. [Flujo de arranque (orden de carga)](#-flujo-de-arranque-orden-de-carga)
11. [Convenciones de código](#-convenciones-de-código)
12. [Ideas de futuro](#-ideas-de-futuro)

---

## 🚀 Cómo ejecutar

Al ser una app 100% estática, basta con servir el repositorio:

```bash
# Opción 1: abrir directamente
xdg-open index.html          # Linux
open index.html              # macOS

# Opción 2 (recomendada): servidor estático local
python3 -m http.server 8080  # y entrar en http://localhost:8080
```

**Configuración necesaria dentro de la app (Panel de Ajustes):**

| Servicio | Qué necesitas | Dónde se introduce |
|---|---|---|
| Groq / OpenRouter | API key y modelo elegido | Ajustes (`ui-settings.js`); se guarda en el State y lo consume `ai.js` |
| Firebase (opcional) | Configuración del proyecto (apiKey, authDomain, projectId…) | Ajustes; la consume `firebase.js`. Sin esto, la app funciona en modo local |

No hay variables de entorno ni `.env`: las credenciales viven en el estado local del navegador (por eso `.gitignore` excluye cualquier archivo `.env*`).

---

## 🏛️ Arquitectura general

La aplicación sigue una arquitectura **modular sin bundler**, con estos principios:

1. **Estado centralizado único** (`state.js`): todo el estado vive en `State`, accesible solo con `State.get(key)` / `State.set(key, value)`. Está documentado como "v2.1 — Estructura Estricta, cero contaminación de `window`".
2. **Comunicación por eventos** (`event-bus.js`): patrón *publish/subscribe*. Los módulos se avisan entre sí sin llamarse directamente (p. ej., `timer.js` ↔ `tasks.js`).
3. **Lógica pura separada de la UI** (`domain.js`): matemáticas FSRS-6, planificación, fechas y simulaciones, sin tocar el DOM. Sus "reglas de oro" están escritas en la cabecera del archivo.
4. **Composición de la UI por namespaces**: los módulos de `src/js/interfaz/ui-*.js` definen objetos (`UICore`, `UISidebar`, `UIDashboard`…) que `ui.js` ensambla en un único namespace global `UI`.
5. **Local-first con sincronización opcional**: localStorage para el estado, IndexedDB (`db.js`) para telemetría masiva/objetos pesados, y Firebase (`firebase.js`) como espejo en la nube.
6. **Registro de comandos**: `command-registry.js` permite que cada módulo registre handlers de acciones y que `app.js` solo despache (desacopla atajos de teclado/botones de la lógica).

### Librerías externas (CDN, declaradas en `index.html`)

| Librería | Uso |
|---|---|
| **MathJax 3** (+ paquete `amscd`) | Renderizado LaTeX en tarjetas. Incluye decenas de macros propias (`\R`, `\N`, `\hess`, `\jac`, …) definidas inline en `<head>` |
| **Chart.js** | Gráficas del dashboard (curva de olvido, dificultad, pronósticos) |
| **Vis Network 9.1.9** | Mapa conceptual interactivo (`ui-graph.js`) |
| **SortableJS** | Reordenación drag & drop de widgets del dashboard (`widget-manager.js`) |
| **Firebase 10.7.0 compat** (app, auth, firestore) | Autenticación, sincronización y funciones sociales |

---

## 📂 Estructura del repositorio

```
.
├── index.html              ← SPA completa: HTML + arranque + config MathJax
├── README.md               ← Este documento
├── .gitignore              ← Exclusiones estándar (binarios, deps, IDE, secrets)
├── assets/
│   └── audio/              ← SFX y pistas ambientales (oggs/mp3) + placeholder
├── secretos/
│   ├── .gitignore          ← Autoexclusión parcial de la carpeta
│   └── no.txt              ← Auditoría técnica y backlog de mejoras (v1.18)
└── src/
    ├── css/
    │   ├── styles.css      ← Sistema de diseño completo (design tokens CSS)
    │   └── hola.txt        ← Archivo de prueba/basura
    └── js/
        ├── *.js            ← ~38 módulos de lógica, dominio, IA, red y UI
        └── interfaz/       ← 11 sub-módulos de UI (ui-*.js) que compone ui.js
```

---

## Descripción de archivos raíz

### `index.html` (~2.100 líneas)
Página única de la aplicación (**Estudiador Pro**). Contiene:
- **Configuración de MathJax inline**: delimitadores `$…$` / `$$…$$`, escapes, paquete `amscd` y un extenso juego de **macros LaTeX personalizadas** organizadas por categoría (tamaño, lógica, conjuntos numéricos `\N \Z \Q \R \C`, análisis `\hess` `\jac` `\riemann`, álgebra `\subgrupo` `\ideal` `\primo`, topología `\tdisc` `\tusual`…). Esto permite escribir apuntes matemáticos avanzados en las tarjetas.
- **Todo el esqueleto HTML de la SPA**: sidebar, panel de estudio, editor, pomodoro, dashboard, modales de ajustes/filtros/amigos/examen/grafos, etc. Cada elemento lleva el `id` que consumen los módulos JS.
- **Carga de librerías CDN** (ver tabla anterior) y de los **~50 scripts propios en el orden exacto** que exige la arquitectura (logger → state → … → ui → app).

### `README.md`
Este documento: descripción exhaustiva de cada archivo y su función.

### `.gitignore`
Reglas de exclusión del repositorio: archivos compilados (`*.pyc`, `*.o`, `*.class`…), dependencias (`node_modules/`, `venv/`), **secrets** (`.env`, `.env.local`, `*.env.*`), artefactos de build (`dist/`, `build/`), archivos de IDE (`.vscode/`, `.idea/`), logs, coberturas de tests y basura de SO/caché.

---

## `src/css` — Estilos

### `styles.css` (~1.700 líneas)
Hoja de estilos única de toda la aplicación. Empieza con un bloque de **Design Tokens**: variables CSS en `:root` para superficies (`--bg-color`, `--menu-color`, `--card-bg`, `--surface-1..3`), texto (`--text-main`, `--text-muted`), bordes, acento (`--accent: #4CAF50`) y colores semánticos del Pomodoro (`--pomo-work`, `--pomo-short`…). A partir de ahí se definen todos los componentes: layout del sidebar, tarjetas de estudio, modales, widgets del dashboard, heatmap, paneles móviles, etc. El tema dinámico por asignatura se logra inyectando variables CSS desde `colors.js`.

### `hola.txt`
Archivo de prueba/placer (broma de desarrollo). Sin función real.

---

## `src/js` — Lógica de la aplicación

Todos los módulos usan IIFE (`const X = (() => { … })()`) y se exponen como globales controlados. Cada archivo comienza con una cabecera que documenta su responsabilidad y sus dependencias de carga.

### Núcleo e infraestructura

#### `app.js` (~1.100 líneas) — Núcleo de arranque y orquestador
El "director de orquesta". Define `APP_VERSION`, el objeto utilitario `Util` (`loadLS`, `pad2`, `toggleModal`), helpers globales como `escapeHtml`, el **listener maestro de teclado**, la inicialización de la app y el cableado entre módulos (recibe eventos del Pomodoro, despacho de comandos, etc.). Es el último script cargado.

#### `state.js` (~220 líneas) — Estado centralizado
Única fuente de verdad. Estructura v2.1 estricta: lecturas/escrituras obligatorias vía `State.get(key)` / `State.set(key, val)`, con claves para biblioteca de tarjetas, ajustes, API keys, modelo de IA, sesión, ambient/reward/alarm tracks, etc. Diseñado para minimizar la contaminación de `window`.

#### `event-bus.js` (~26 líneas) — Pub/Sub
Micro módulo de mensajería centralizada: `EventBus.subscribe(evento, fn)` / `publish(evento, data)`. Permite desacoplar módulos (p. ej., timer notifica a tasks sin conocerlo).

#### `command-registry.js` (~30 líneas)
Registro central de acciones de UI: cada módulo registra sus handlers bajo un nombre y `app.js` únicamente despacha. Facilita atajos de teclado y botones genéricos.

#### `logger.js` (~26 líneas)
Telemetría interna (buffer circular de ~200 entradas con `Logger.warn/info/...`). **Debe ser el primer script cargado** (los módulos inferiores usan guardas `typeof Logger !== 'undefined'` como salvavidas; ver auditoría n.º 17 en `secretos/no.txt`).

#### `toast.js` (~217 líneas)
Sistema de notificaciones no bloqueantes que sustituye a `alert()`. Inyecta su propio contenedor DOM si no existe. API: `show`, `ask` (confirmación asíncrona), `showProgress` / `removeProgress` (progresos indeterminados para llamadas a IA/red).

#### `filters.js` (~93 líneas)
Gestión de los **filtros de la cola de estudio** (por asignatura/tema/rango): apertura y cierre del modal, toggle de dropdowns e iconos, limpieza y `sincronizarFiltrosAlState()` para volcar la selección al State que consume `study-engine.js`.

#### `mobile.js` (~86 líneas)
Navegación y layout móvil: `toggleSidebar`, `toggleMobileMenu`, `manejarNavegacionMovil`, `toggleMobileStats`, `cerrarPanelesMoviles`, más helpers de feedback táctil (`simularClickVisual`, `feedbackVisualSimple`).

### Dominio y motor de estudio

#### `domain.js` (~1.080 líneas) — Lógica pura
El corazón matemático, sin ninguna dependencia del DOM. Contiene:
- **FSRS-6 completo**: constantes por defecto (`FSRS6_W_DEFAULT`, 21 pesos; `FSRS6_DR_DEFAULT = 0.90`) y funciones `fsrsR` (retrievability), `fsrsS/fsrsSf/fsrsSr/fsrsSst` (estabilidad), `fsrsD`/`fsrsDnext` (dificultad), `fsrsInterval`, `getFsrsConstants`, `appGradeToFSRS`, `migrarAFsrs`.
- **Planificación y fechas**: `calcularDeuda`, `calcularDiasRestantesExamen`, `calcularProbabilidadExito`, `calcularRitmoEstudioRequerido`, `generarHorarioPlanificador`, `simularPlanificacion`, `calcularHoraFinPomodoro`, normalizadores de fechas (`parseDateSafe`, `formatearFechaES`, `diffDiasCalendario`, `normalizarBibliotecaFechas`…).
- Helpers de contexto: `getObjetivoHoy`, `getObjetivoContextual`, `_esTemporadaExamenes`, resolución de asignatura de tareas.

#### `study-engine.js` (~386 líneas) — Motor de estudio y cola
Encapsula el filtrado de la cola (`aplicarFiltros`), la navegación (`siguienteTarjeta` / `anteriorTarjeta`, modo secuencial/lectura, índice estilo Anki) y el procesamiento de repasos (`procesarRepaso` / `procesarRepasoAnki`), delegando la matemática en `domain.js` y actualizando FSRS por tarjeta.

#### `parser.js` (~278 líneas) — Análisis léxico
Convierte texto/LaTeX importado en tarjetas estructuradas: `parseLatexToCards`, saneamiento de LaTeX (`sanearLatex`, `sanitizeLatexRawInput`, `cleanLatexToHtml`, bloques de ecuaciones via `extractBraceBlock`/`processCajaEq`) y **saneamiento anti-XSS** de HTML (`sanitizeHtmlFragment`, `cleanNode` usando `document.createElement` solo en memoria). Regla de arquitectura: cero manipulación de la UI.

#### `editor.js` (~239 líneas) — Controladores de edición
Modos del área de trabajo (`modoImportar`, `modoEdicionJSON`, `setImportMode`), creación/guardado de conceptos (`guardarNuevoConcepto`, `guardarDatosEditorAmigable`), navegación dentro del editor amigable, reordenación de tarjetas (`ordenarTarjeta`) y procesamiento del contenido pegado (`_procesarContenido`, apoyándose en `Parser`).

#### `asignaturas.js` (~154 líneas)
CRUD de asignaturas/proyectos: `crearProyecto`, `borrarProyecto`, `renombrarAsignatura`, `borrarAsignatura`, `cargarAsignatura`, `guardarProyectos` y refresco del menú lateral (`actualizarMenuLateral`, `actualizarListaProyectos`, `actualizarDesplegableMini`).

#### `agenda.js` (~155 líneas)
Fechas clave y eventos del calendario: tipos de evento (`TIPOS_EVENTO`), CRUD de fechas clave (`guardarFechaClave`, `eliminarFechaClave`, `toggleCompletarFechaClave`), conversores de formato de fecha, modal de fechas, `renderUpcomingEvents`, cambio de mes y colores por tipo de evento.

### Inteligencia Artificial

#### `ai.js` (~555 líneas) — Tutor IA
Módulo del chat del tutor: lee credenciales y modelo del State (cero mutaciones DOM). Orquesta llamadas a **Groq** (`_llamarGroq…`) y **OpenRouter** (`_llamarOpenRouter…`, `cargarModelosOpenRouter`, `getModelosDisponibles`), construye el contexto de estudio (`_construirContexto`), gestiona el historial del chat (`toggleChat`, `enviarMensajeIA`, `agregarMensajeChatDirecto`, indicador de carga), genera títulos automáticos de tarjetas (`generarTituloAutomatico`, `procesarTitulosEnLote`) y variantes por temperatura.

#### `ia-service.js` (~136 líneas)
Servicio de **fragmentación con IA**: divide una tarjeta actual en varias mediante un prompt dedicado (`fragmentarTarjetaActualIA`, `_ejecutarPromptFragmentacion`), parseando la respuesta con `Parser` y fusionándola en la biblioteca vía State/EventBus.

#### `graph-ai.js` (~241 líneas)
Generación de **mapas conceptuales con IA**. Usa un **formato DSL lineal robusto** (relaciones tipo `A -> B: implica`) para evitar que los modelos gratuitos alucinen con JSON/LaTeX; incluye revisión de texto plano (`_abrirRevisionTextoPlano`), parseo tolerante (`_parsearRelacionesTexto`), normalización/resolución de títulos y aplicación de relaciones al grafo (`_aplicarRelacionesAlGrafo`, `generarMapaConIA`).

#### `test-ai.js` (~313 líneas)
Generación de **preguntas tipo test con IA**: selección de un batch de conceptos (`_seleccionarBatchConceptos`), construcción del prompt en DSL lineal (`_construirTextoDSL`), parseo tolerante (`_parsearPreguntasTexto`), reintentos de preguntas inválidas (`_reintentarPreguntasInvalidas`), advertencias si hay pocas preguntas válidas y **control de temperatura semántico** (Conservador / Equilibrado / Innovador). Filosofía "caja negra": el usuario no ve las preguntas hasta empezar el test.

#### `quiz.js` (~228 líneas)
Lógica del **modo Tipo Test**: `iniciar` (pide preguntas a `test-ai`), navegación entre preguntas, selección de opción, finalización, cálculo de resultado y **actualización del FSRS** de cada tarjeta según acierto (`_actualizarFSRS`), además de `repetir`.

#### `ui-quiz.js` (~277 líneas)
Interfaz del quiz: modal de configuración (selector de dificultad y temperatura), render de cada pregunta y pantalla de resultados.

### Nube, datos y telemetría

#### `firebase.js` (~409 líneas)
Capa de red con Firebase (SDK compat): inicialización diferida (`asegurarFirebaseInit`, `inicializarFirebase`), autenticación por email/password y Google (`procesarLogin`, `procesarRegistro`, `procesarLoginGoogle`, `cerrarSesion`, `_manejarCambioAuth`), persistencia en Firestore (`guardarDatosUsuario`, `cargarDatosUsuario`), estrategias de sincronización (`sincronizar`, `comprobarNubeAlIniciar`, `forzarBajada`, `forzarRespaldoNube`) y `sincronizarTelemetriaFSRS`.

#### `amigos.js` (~250 líneas)
Sistema social sobre Firestore: enviar/aceptar/rechazar solicitudes de amistad, eliminar amigo, cargar panel, estadísticas de amigos (`verStats`) y **compartir/importar materiales** (`abrirCompartir`, `compartir`, `importarCompartida`). Cero DOM directo: delega en `ui-amigos.js`.

#### `db.js` (~133 líneas)
Capa de persistencia asíncrona sobre **IndexedDB** para telemetría masiva y objetos pesados (patrón local-first). Expone init y operaciones CRUD por almacenes.

#### `data-io.js` (~273 líneas)
Entrada/salida de datos: exportación/importación de asignaturas y **backups completos** (`exportarBackup`, `importarBackup`, `descargarAsignaturaActual`, `procesarImportacion`, `procesarImportacionLatex`), guardado de ediciones JSON, creación de nuevas asignaturas y descarga de archivos (`_descargar`). Recibe callbacks de orquestación vía `init()`.

#### `telemetry.js` (~780 líneas) — Motor de estadísticas
Calcula y alimenta el dashboard: deuda de estudio, eficiencia, **curva de olvido**, probabilidad de aprobado (`updateProbabilidadAprobado`), **simulación de Monte Carlo** (`lanzarSimulacionMonteCarlo` con filtros propios), mapa de calor del calendario, estadísticas semanales/mensuales, rachas (`_calcularRachaDesdeEstado`), registro de pomodoros y exámenes, edición manual de progreso, resumen de sesión y `construirResumenPublico` (para compartir con amigos).

#### `widget-manager.js` (~250 líneas)
Orquestador visual del dashboard: layout de widgets configurable con drag & drop (SortableJS) basado en `order` de Flexbox, minimizar/ocultar, panel de gestión y restauración — todo **sin destruir nodos en caliente ni recargar la página**.

### Productividad: Pomodoro, tareas y temporizador

#### `pomodoro.js` (~531 líneas)
Gestor de tiempo y tareas "clásico" (coexiste con la pareja `timer.js`+`tasks.js` heredada): modos work/short/long break, inicio/pausa (`toggleTimer`, `startTimer`, `pauseTimer`), finalización de pomodoro y su registro, ajuste de pomodoros por tarea, hora de fin estimada (`updateFinishTime`) y formularios de tarea. Emite `CustomEvent`s para que `app.js` orqueste.

#### `timer.js` (~122 líneas)
Motor puro del ciclo Pomodoro (work/break y reloj). Responsabilidad única; se comunica con `tasks.js` **solo** a través de `EventBus` (`toggle`, `_iniciar`, `_pausar`, `_finalizarCiclo`, `_procesarCicloTrabajo`, info de ciclo).

#### `tasks.js` (~224 líneas)
CRUD de tareas del Pomodoro y render de la lista: crear/editar/eliminar, marcar hecha, activar tarea ("tarea activa"), ajustar nº de pomodoros estimados y cálculo de la hora prevista de fin de jornada (`_actualizarFinishTime`).

### Multimedia y extras

#### `audio-manager.js` (~406 líneas)
Capa híbrida de gestión de audio, **reactiva al estado** (esclavo de `State`): sonido ambiental en loop (ruido marrón sintetizado con WebAudio o pistas de `assets/audio`), efectos de recompensa al terminar pomodoros/logros (campana de Notre-Dame, moneda Mario, victoria Pokémon, trofeo PS3…), alarma, previsualizaciones, ganancia/pitch y `init`. Catálogo de rutas en `audio-data.js`.

#### `audio-data.js` (~109 líneas)
Datos de audio: catálogo `SFX`/pistas con rutas a `assets/audio/*` y una **alarma en Base64** embebida (`ALARMA_BASE64`) para no depender de archivo externo.

#### `pdf-manager.js` (~210 líneas)
Visor de recursos PDF: slots/apartados tipo acordeón, carga de ficheros como blobs gestionando la memoria RAM (`cargarPDFEnSlot`, `_mostrarBlobEnVisor`), creación/borrado de slots y resaltado del slot activo.

#### `pizarra.js` (~168 líneas)
Subsistema de **canvas dibujable** superponible (anotaciones sobre tarjetas/PDF): modos, color, grosor, deshacer con snapshots, soporte ratón+táctil, limpiar y toggle. API pública: `{ init, toggle, setModo, setColor, setGrosor, limpiar, undo }`.

#### `colors.js` (~130 líneas)
Motor de temas: paleta por asignatura (`getColorAsignatura`), conversores (`rgbToHex`), inyección de variables CSS en tiempo real (`inyectarVariablesCSS`), guardado/carga globales (`guardarColoresGlobales` / `cargarColoresGlobales`) y render del selector de colores de ajustes. Debe cargarse antes de `asignaturas.js`, `agenda.js`, `settings.js` y `app.js`.

#### `settings.js` (~268 líneas)
Lógica de ajustes: `initAppState`, sincronización de inputs del Pomodoro, apariencia (cargar/guardar), **privacidad** (`togglePrivacidadUI` oculta datos sensibles), horario semanal (`renderHorarioGrid`, `guardarHorarioDia`), reseteo de sesión y persistencia de ajustes.

#### `graph.js` (~362 líneas)
Controlador del **mapa conceptual relacional**: nodos/aristas derivados de la biblioteca (`addNode`, `addEdge`, `removeNode`, `removeEdge`, `addMassiveNodes`), enriquecimiento y auto-enlazado de demos (`_autoLinkDemos`), búsqueda de tarjetas, calificar una tarjeta desde el mapa (`calificarTarjetaDesdeMapa`) y persistencia. Lógica pura + State + EventBus; el renderizado lo hace `ui-graph.js`.

#### `exam.js` (~621 líneas)
Módulo completo del **Modo Examen**: dos formatos — *flash* (autoevaluación con revelado y estrellas) y *real* (con temporizador, respuestas escritas, navegación y entrega) —, corrección (incluida evaluación estilo **Feynman con IA** en `_evaluarFeynmanIA`), cálculo de nota, resultados y reintento. Al terminar registra el examen en telemetría.

#### `ui.js` (~28 líneas) — Compositor
No contiene funciones propias: **ensambla** los sub-módulos de `src/js/interfaz/` (`UICore`, `UISidebar`, `UIStudy`, `UIEditor`, `UIDashboard`, `UIPomo`, `UIAgenda`, `UIAmigos`, `UISettings`, `UIGraph`, `UIExamPlanner`) en el namespace global `UI` que consume el resto de la app.

#### `hola.gitkeep`
Archivo residual de prueba (contenido de broma). Sin función.

---

## `src/js/interfaz` — Módulos de UI

Cada archivo define un namespace con closures; `ui.js` los compone. Convención: **solo DOM**, la lógica vive en los módulos de dominio.

| Archivo | Namespace | Función |
|---|---|---|
| `ui-core.js` (150 l.) | `UICore` | Funciones base compartidas: visibilidad de vistas (`ocultarTodo`), sesión y chat. Se carga antes que los demás. |
| `ui-sidebar.js` (382 l.) | `UISidebar` | Menú lateral: biblioteca/asignaturas, proyectos, despliegue de apartados, acceso a PDF y colores. |
| `ui-study.js` (150 l.) | `UIStudy` | Tarjeta de estudio activa, estado/render de filtros y controles de modo de estudio. |
| `ui-editor.js` (152 l.) | `UIEditor` | Editor visual de tarjetas y vista JSON (apertura, campos, navegación concepto anterior/siguiente). |
| `ui-dashboard.js` (1.336 l.) | `UIDashboard` | Widgets del panel de estadísticas: dificultad, heatmap, gráficas Chart.js, resúmenes de sesión… |
| `ui-pomo.js` (253 l.) | `UIPomo` | Widgets del Pomodoro: display del timer, lista de tareas, hora de fin, mini-panel. |
| `ui-agenda.js` (118 l.) | `UIAgenda` | Modal de fechas clave y lista de eventos próximos. |
| `ui-amigos.js` (244 l.) | `UIAmigos` | Panel social: lista de amigos, solicitudes, stats, compartir y pantallas de login/registro. |
| `ui-settings.js` (334 l.) | `UISettings` | Panel de ajustes: API keys/modelos de IA, Firebase, apariencia, horario, colores y privacidad. |
| `ui-graph.js` (675 l.) | `UIGraph` | Renderizado del mapa conceptual con **Vis.js Network** (nodos coloreados por asignatura, interacciones). Cero lógica de negocio. |
| `ui-examplanner.js` (2.195 l.) | `UIExamPlanner` | Workspace de **planificación avanzada**: vista de calendario, planificación por examen, integración con `domain.simularPlanificacion` y el horario generado. Es el módulo de UI más grande. |
| `.name` | — | Archivo marcador con el nombre de la carpeta/paquete (`interfaz`). Sin función ejecutable. |

---

## `assets/audio` — Sonidos

Reproducidos por `audio-manager.js` (catálogo en `audio-data.js`). Se usan como **refuerzos positivos** al completar pomodoros, exámenes o logros, y como **ambientes** para concentrarse:

| Archivo | Tipo | Uso típico |
|---|---|---|
| `campana_notreDame.ogg` | SFX | Fin de pomodoro (efecto "campana") |
| `mario_world_clear.ogg`, `mario_coin.ogg`, `mario_warning.ogg` | SFX | Recompensas Nintendo-style (completar nivel/test, aviso) |
| `victoria_pokemon.ogg`, `pokemon_team_victory_bits.ogg` | SFX | Victorias / racha lograda |
| `trofeo_ps3.ogg` | SFX | Logro desbloqueado |
| `buena.mp3` | SFX | Respuesta correcta ("estrellita") |
| `bump_into_wall.ogg` | SFX | Error/respuesta incorrecta |
| `olas_oceanicas.ogg`, `pajaros_cantando.ogg`, `night.ogg`, `rain_inside_car.ogg`, `fire_crackling.ogg`, `tren_con_gente.ogg`, `interior_vagon.ogg`, `cafeteria.ogg`, `abyss_ambience.ogg` | Ambiente | Ruido blanco/ambiente en loop durante el estudio |
| `hola.txt` | — | Placeholder de broma, sin uso |

---

## `secretos/` — Backlog interno

Carpeta de notas privadas del desarrollador (auditorías y borradores). No forma parte del runtime.

- **`no.txt` (115 líneas)**: *"ESTUDIADOR PRO — Auditoría técnica y backlog de mejoras (v1.18)"*. Lista numerada de ~19 refactorings pendientes con formato *Dónde / Qué / Por qué*, por ejemplo: purgar lógica SRS de `telemetry.js` hacia `domain.js`, desacoplar el DOM de `study-engine.js`, sanear objetos no serializables del State, arreglar la secuencia de arranque del Logger, eliminar el antipatrón de "ghost clicking" y sellar la mutabilidad de `State.get` (devolver clones profundos).
- **`.gitignore`**: autoexcluye `no.txt`, `secrets.txt` y `mis-secretos.txt` para que estas notas no se suban accidentalmente en el futuro (el `no.txt` ya versionado permanece).

---

## 🔄 Flujo de arranque (orden de carga)

Según las cabeceras de `app.js` y los comentarios de cada módulo:

```
logger.js → state.js → db.js → event-bus.js → command-registry.js
→ firebase.js → colors.js → agenda.js → asignaturas.js → parser.js
→ domain.js → editor.js → ia-service.js → ai.js → settings.js
→ filters.js → mobile.js → toast.js → audio-* → pdf-manager.js
→ study-engine.js → exam.js → quiz.js/test-ai.js → graph*.js
→ pomodoro.js / timer.js / tasks.js → telemetry.js → widget-manager.js
→ data-io.js → amigos.js → interfaz/ui-*.js → ui.js → app.js
```

Después del arranque: `State` se hidrata desde localStorage (y Firebase si hay sesión), `DB` abre IndexedDB, `WidgetManager.init` monta el dashboard, `AudioManager.init` prepara el audio tras la primera interacción, y `APP` enlaza atajos, despacho de comandos y listeners del EventBus.

**Flujo de un repaso típico:** `study-engine.aplicarFiltros()` construye la cola → `UI.UIStudy` pinta la tarjeta (MathJax la renderiza) → el usuario se autoevalúa → `procesarRepaso(grade)` llama a `domain.fsrs*` para recalcular estabilidad/dificultad/intervalo → `State.set` persiste → `EventBus` avisa → `telemetry` refresca widgets y `audio-manager` reproduce la recompensa.

---

## 🧑‍💻 Convenciones de código

- **Sin framework ni bundler**: JavaScript vanilla, módulos IIFE expuestos como globales nombrados (`State`, `Domain`, `Graph`, `Toast`…).
- **Separation of Concerns estricta**: los módulos de dominio/lógica tienen prohibido tocar el DOM; los `ui-*.js` tienen prohibido contener lógica de negocio; la comunicación transversal va por `EventBus`/`CommandRegistry`.
- **Acceso al estado solo por `State.get/set`** (nunca mutando referencias directamente).
- **Cabeceras de archivo obligatorias**: banner `═` con nombre, responsabilidad, dependencias y orden de carga.
- **Comentarios y nombres en español** para la lógica de dominio; identificadores técnicos en inglés cuando procede.
- **Anti-XSS**: todo HTML generado pasa por `Parser.sanitizeHtmlFragment` / `escapeHtml`.

---

## 💡 Ideas de futuro

- Un LLM podría generar un JSON/CSV con las **relaciones entre tarjetas** de un tema entero; admitir CSV como formato más robusto y fallbacks de revisión humana/por otro LLM ante alucinaciones o errores de sintaxis.
- Etiquetar relaciones ("relacionado", "implica"…) con **pesos** y tenerlas en cuenta en las **simulaciones de Monte Carlo** para que los conceptos relacionados puntúen en bloque.
- Ejercicio específico para lenguajes de programación: **comentar un pipeline de ~30 líneas** explicándolo a alguien que lo ve por primera vez, como examen.

---

*Documento generado a partir del análisis del código en la rama actual (commit `89e4639`, merge de PR #15 "graph-generation-with-llm"). Si cambias la arquitectura, actualiza este README.* ✍️
