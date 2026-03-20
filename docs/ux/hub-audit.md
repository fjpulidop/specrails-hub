# Evaluación de Usabilidad: specrails-hub Dashboard

**Fecha:** 2026-03-20
**Evaluador:** UX Researcher (Agente ca4035d0)
**Metodología:** Nielsen's 10 Usability Heuristics
**Escala de severidad:** 0 (cosmético) → 1 (mínimo) → 2 (moderado) → 3 (alto) → 4 (crítico)

---

## Resumen

specrails-hub presenta una interfaz técnicamente sólida con buena arquitectura multi-proyecto y actualizaciones en tiempo real. Sin embargo, la experiencia sufre en tres áreas clave: **falta de retroalimentación clara en estados de error y progreso**, **accesibilidad comprometida por tipografías diminutas y codificación por color exclusiva**, y **jerarquía de navegación confusa entre configuraciones a nivel hub y proyecto**. Con mejoras focalizadas en los flujos críticos (onboarding, ejecución de jobs, depuración), el producto puede ofrecer una experiencia significativamente más premium.

---

## Hallazgos

| # | Heurística | Severidad | Pantalla/Flujo | Problema | Recomendación | Esfuerzo |
|---|-----------|-----------|----------------|----------|---------------|----------|
| 1 | Visibility of system status | 4 | Setup Wizard — fase Installing | No hay indicador de progreso durante la instalación: solo logs sin estructura. El usuario no sabe si el proceso está funcionando o colgado. | Agregar barra de progreso con porcentaje estimado y "Paso X de Y" basado en checkpoints conocidos. Mostrar spinner explícito con texto dinámico ("Instalando dependencias…", "Configurando agentes…"). | medium |
| 2 | Visibility of system status | 3 | JobDetailPage — log viewer | El log se trunca en 10k líneas sin advertencia visible. El usuario puede perder contexto crítico del inicio del job. | Mostrar banner "⚠ Log truncado — se muestran las últimas 8.000 líneas" cuando se alcanza el límite. Ofrecer enlace "Descargar log completo". | small |
| 3 | Visibility of system status | 3 | DashboardPage — command execution | Al lanzar un comando, el único feedback es un toast que desaparece. El usuario no sabe si el job está en cola o ya ejecutándose hasta que aparece en la lista. | Mostrar estado inline en el botón del comando ("En cola…") hasta que el job aparezca en RecentJobs. Añadir highlight temporal en la fila nueva del job. | medium |
| 4 | Visibility of system status | 2 | HubOverviewPage — search | Búsqueda con debounce de 350ms sin estado de carga visible. El usuario no sabe si la búsqueda está procesando. | Mostrar spinner en el input o skeleton rows durante la búsqueda. | small |
| 5 | Match between system and the real world | 3 | DashboardPage — jobs list | Las propuestas se presentan como jobs con ID prefijo `proposal:*`. El usuario ve "jobs" que se comportan diferente sin explicación del sistema. | Crear una sección separada "Propuestas" o usar un tipo visual distinto (card vs. row). Eliminar el hack del prefijo. | large |
| 6 | Match between system and the real world | 2 | JobDetailPage — status badge | El estado `zombie_terminated` es jerga técnica interna. El usuario no entiende qué pasó. | Reemplazar con "Auto-terminado (inactivo)" y descripción en tooltip: "El job no respondió y fue detenido automáticamente." | small |
| 7 | Match between system and the real world | 2 | PipelineProgress | Los colores de fase (purple, green, red, gray) no tienen leyenda. El usuario tiene que inferir el significado. | Agregar leyenda inline: ● Ejecutando ● Completado ● Error ● Pendiente. | small |
| 8 | User control and freedom | 4 | GlobalSettingsPage — remove project | Eliminar un proyecto no tiene confirmación. Un click accidental borra el proyecto sin posibilidad de recuperación. | Añadir dialog de confirmación con el nombre del proyecto. Considerar soft-delete con opción "Deshacer" por 5 segundos. | small |
| 9 | User control and freedom | 3 | ChatPanel — delete conversation | Eliminar una conversación ocurre sin confirmación. El historial de chat puede perderse accidentalmente. | Dialog de confirmación o acción "Deshacer" con timeout. | small |
| 10 | User control and freedom | 2 | SettingsPage — unsaved changes | El indicador de cambios sin guardar es un punto ámbar pequeño. Los usuarios pueden navegar fuera y perder cambios sin notarlo. | Mostrar banner prominente "Tienes cambios sin guardar" con botones "Guardar" y "Descartar". El guard de navegación ya existe — hacerlo más visible. | small |
| 11 | Consistency and standards | 3 | Analytics — hub vs. proyecto | El selector de período tiene refresh separado en HubAnalyticsPage pero no en AnalyticsPage. Las acciones de actualización no son consistentes entre las dos vistas. | Unificar el patrón: mismo componente `PeriodSelector` con refresh incluido en ambas páginas. | medium |
| 12 | Consistency and standards | 3 | Navegación — hub vs. proyecto | Las páginas a nivel hub (Overview, Analytics, Docs) se abren como modals/dialogs. Las páginas de proyecto son rutas normales. El usuario no puede bookmarkear ni compartir URLs de las páginas hub. | Convertir Overview, Analytics y Docs del hub en rutas normales (`/hub/overview`, `/hub/analytics`, `/hub/docs`). | large |
| 13 | Consistency and standards | 2 | CommandGrid — nombres | Nombres de display ("Auto-propose Specs") vs. slugs internos (`update-product-driven-backlog`) son inconsistentes. Los usuarios avanzados que usan CLI tienen que adivinar la relación. | Mostrar el slug del comando en el tooltip o como subtítulo con estilo `code`. | small |
| 14 | Consistency and standards | 2 | Typography | Mezcla arbitraria de `text-[9px]`, `text-[10px]`, `text-[11px]` — fuera del sistema de diseño de Tailwind. Texto ilegible a 9px. | Establecer escala tipográfica mínima: `text-xs` (12px) como mínimo en UI. Auditar y eliminar todos los tamaños custom por debajo de 12px. | medium |
| 15 | Error prevention | 3 | AddProjectDialog | La validación del path ocurre en el servidor. El usuario puede escribir paths incorrectos y solo descubrirlo después del submit. | Validar formato de path en cliente (ej: debe comenzar con `/`). Mostrar warning si el path no existe (requiere endpoint de validación ligero). | medium |
| 16 | Error prevention | 2 | RecentJobs — clear history | La opción "Limpiar historial" está disponible sin fricción suficiente. El diálogo existe pero la acción es irreversible. | Agregar confirmación explícita que muestre el número de jobs que se van a eliminar: "Eliminar 47 jobs del 1 al 15 de marzo?" | small |
| 17 | Recognition rather than recall | 3 | HubOverviewPage — search results | Los resultados de búsqueda muestran jobs/propuestas/mensajes por proyecto, pero no hay enlace directo. El usuario debe recordar qué proyecto y navegar manualmente. | Hacer los resultados clickeables: al hacer click, cambiar al proyecto correspondiente y navegar al elemento (job detail, chat, etc.). | medium |
| 18 | Recognition rather than recall | 2 | ProjectNavbar — settings duality | Hay configuración a nivel hub (modal de Settings en la barra superior) y a nivel proyecto (ruta `/settings`). Los usuarios no saben dónde está cada opción sin explorar ambas. | Añadir etiquetas claras: "Configuración del Hub" vs. "Configuración del Proyecto". Considerar consolidar en un único panel con secciones. | medium |
| 19 | Flexibility and efficiency of use | 3 | CommandGrid — keyboard shortcuts | No hay atajos de teclado para los comandos más usados. Los usuarios avanzados deben siempre usar el mouse. | Documentar y habilitar atajos: `Cmd+Shift+I` para Implement, `Cmd+Shift+B` para Batch Implement, etc. Mostrar hints en los tooltips de los cards. | large |
| 20 | Flexibility and efficiency of use | 2 | TabBar — project switching | Sin atajos de teclado para cambiar entre proyectos (e.g., `Ctrl+Tab`, `Cmd+1/2/3`). | Implementar navegación por teclado entre tabs de proyecto. | medium |
| 21 | Aesthetic and minimalist design | 2 | SettingsPage — placeholders | Las secciones "Queue" y "Display" muestran "Coming soon" pero ocupan espacio completo en la UI. Crean expectativas sin cumplirlas. | Eliminar las secciones placeholder hasta que tengan implementación real. O colapsar en un único acordeón "Próximamente" al final de la página. | small |
| 22 | Aesthetic and minimalist design | 2 | RecentJobs — compare mode | El botón de modo comparación es un icono pequeño sin label. La feature existe pero es prácticamente invisible para el usuario medio. | Agregar label "Comparar" al botón, o hacer la feature más descubrible con un hint contextual la primera vez. | small |
| 23 | Help users recognize, diagnose, and recover from errors | 4 | JobDetailPage — failed jobs | Cuando un job falla, el usuario solo ve el status "failed" y debe leer todos los logs para entender la causa. No hay resumen de error. | Extraer y mostrar el último mensaje de error o stderr prominentemente en el header del job. Agregar sección "Causa del error" con los últimos N lines relevantes. | medium |
| 24 | Help users recognize, diagnose, and recover from errors | 3 | SetupWizard — error phase | La fase de error del wizard muestra "Retry" y "Skip" pero no explica qué falló ni qué hace cada opción. | Mostrar el error específico (del log de instalación). Explicar qué hace "Skip" (continuar sin specrails-core completo). Agregar enlace a documentación. | medium |
| 25 | Help users recognize, diagnose, and recover from errors | 2 | Network errors | Los errores de red se muestran solo como toasts que desaparecen. En páginas como Analytics, si la carga falla no hay opción clara de reintentar. | Añadir estado de error persistente con botón "Reintentar" en las páginas que cargan datos críticos (Analytics, Activity, Jobs). | medium |
| 26 | Help and documentation | 3 | WelcomeScreen — onboarding | La pantalla de bienvenida no explica qué es specrails-hub ni qué puede hacer. El botón "Add your first project" no da contexto de qué se va a hacer. | Agregar 2-3 líneas explicativas: "specrails-hub coordina tus pipelines de desarrollo con IA. Conecta un proyecto para empezar." Añadir un enlace "¿Cómo funciona?" hacia documentación. | small |
| 27 | Help and documentation | 2 | CommandGrid | Los comandos tienen tooltips con descripción, pero no hay forma de ver más detalle (ej: qué genera, cuánto puede costar, qué parámetros acepta). | Agregar panel lateral de detalle del comando al hover/click, o enlace a docs específico del comando. | medium |

---

## Quick Wins (implementar ya)

Estas mejoras tienen alto impacto y bajo esfuerzo (≤ 1 día de desarrollo):

1. **Confirmación al eliminar proyecto** — Un dialog simple previene pérdida accidental de datos. Crítico. `GlobalSettingsPage`
2. **Banner de cambios sin guardar más visible** — Cambiar el punto ámbar por un banner con botones de acción. `SettingsPage`
3. **Estado `zombie_terminated` → lenguaje humano** — Cambio de texto, cero código nuevo. `JobDetailPage`
4. **Leyenda de colores en PipelineProgress** — Agregar 4 etiquetas de color al componente. `PipelineProgress.tsx`
5. **Eliminar secciones "Coming soon" en Settings** — Reducir ruido visual eliminando placeholders. `SettingsPage`
6. **Warning de log truncado** — Mostrar banner cuando se alcanza el límite de 10k líneas. `LogViewer.tsx`
7. **Texto explicativo en WelcomeScreen** — 2 líneas de copy que contextualizan el producto. `WelcomeScreen.tsx`
8. **Slug del comando en tooltip** — Mostrar el identificador `/sr:*` en los cards del grid. `CommandGrid.tsx`

---

## Mejoras Estructurales (planificar)

Estas mejoras requieren diseño y coordinación cross-team:

### P1 — Flujo de depuración de jobs fallidos
**Problema:** Un job fallido no da información accionable sin leer cientos de líneas de log.
**Solución:** Header de job con sección "Resumen de error" — extraer el último bloque de stderr, mostrar los últimos 10 lines relevantes, ofrecer descarga del log completo.
**Impacto:** Reduce el tiempo de diagnóstico de 5-10 min a <30 segundos.
**Esfuerzo:** Medium (requiere parsing de logs + UI)

### P2 — Propuestas como entidad de primera clase
**Problema:** Las propuestas se muestran como "jobs falsos" con prefijo `proposal:*`, lo que crea confusión visual y técnica.
**Solución:** Crear una sección/página propia para propuestas con UI dedicada (card type vs. table row). Eliminar el hack del prefijo.
**Impacto:** Elimina confusión y abre espacio para un flujo de aprobación/rechazo más claro.
**Esfuerzo:** Large

### P3 — Rutas reales para páginas del hub
**Problema:** Overview, Analytics y Docs del hub son modals/dialogs sin URL propia. No se pueden bookmarkear ni compartir.
**Solución:** Migrar a rutas `/hub/overview`, `/hub/analytics`, `/hub/docs`. Mantener la navegación por tab bar pero como enlaces normales.
**Impacto:** Mejora bookmarkability y permite navegación por URL directa.
**Esfuerzo:** Large

### P4 — Auditoría de accesibilidad completa
**Problema:** Múltiples violaciones WCAG: texto <12px, codificación por color exclusiva, botones icon-only sin aria-label, no hay indicadores de foco visibles.
**Solución:** Campaña de a11y: establecer escala tipográfica mínima (12px), agregar etiquetas de texto a estados de color, aria-labels a todos los botones de icono, verificar contraste WCAG AA.
**Impacto:** Inclusión y compliance legal.
**Esfuerzo:** Medium

### P5 — Setup Wizard con progreso y guía post-setup
**Problema:** El wizard no muestra progreso durante la instalación y no guía al usuario cuando termina.
**Solución:** (1) Barra de progreso en fase "Installing" basada en checkpoints detectables. (2) Pantalla de "Next Steps" al completar el setup con los 3 primeros comandos recomendados.
**Impacto:** Reduce abandono en onboarding.
**Esfuerzo:** Medium

---

## Benchmarking Competitivo

### vs. Vercel Dashboard
**Vercel hace bien:** El deployment view muestra un resumen claro del resultado (build failed en línea X, link a la línea exacta). El usuario sabe en <5 segundos si algo falló y por qué.
**Gap en specrails-hub:** JobDetailPage no tiene este resumen. Aplica hallazgo #23.

### vs. Railway
**Railway hace bien:** Los proyectos tienen una barra lateral siempre visible con el estado de cada servicio. El estado del sistema es visible globalmente sin clicks adicionales.
**Gap en specrails-hub:** El StatusBar está en el footer y solo muestra la conexión WebSocket. No hay visibilidad del estado de los jobs activos en la barra de navegación. Aplica hallazgo #1 (visibility of system status).

### vs. Linear
**Linear hace bien:** La jerarquía de navegación es consistente — todo está en el panel izquierdo, sin modals para páginas principales. Los shortcuts de teclado están documentados en tooltips. El sistema de estados usa color + icono + texto, nunca solo color.
**Gap en specrails-hub:** (1) Las páginas hub como modals rompen la coherencia con el patrón de app (hallazgo #12). (2) No hay shortcuts documentados (hallazgo #19). (3) Codificación por color exclusiva en varios lugares (hallazgo #7, #4).

---

## Top 5 Mejoras por Impacto/Esfuerzo

| Ranking | Mejora | Heurística | Impacto | Esfuerzo | Prioridad |
|---------|--------|-----------|---------|----------|-----------|
| 🥇 | Resumen de error en jobs fallidos | Help users recover from errors | Alto | Medium | Critical |
| 🥈 | Confirmación al eliminar proyecto | User control and freedom | Alto | Small | Critical |
| 🥉 | Banner de cambios sin guardar | User control and freedom | Alto | Small | High |
| 4 | Setup Wizard con indicador de progreso | Visibility of system status | Alto | Medium | High |
| 5 | Leyenda de colores + texto en estados | Consistency + Accessibility | Medio | Small | High |

---

*Generado por: UX Researcher Agent — SPEA-389*
*Metodología: Nielsen's 10 Usability Heuristics, escala 0-4*
*Alcance: Evaluación estática del código fuente (client/src/). No incluye pruebas con usuarios reales.*
