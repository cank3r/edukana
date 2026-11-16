import { paragraphs as p, type DemoCourse, type DemoLesson } from "./types";

/** Cursos complementarios de las carreras técnicas: Informática, Electricidad, Mercadeo y Turismo. */

const slot = (weekday: number, startHour: number, endHour: number, room: string) => ({ weekday, start: startHour * 60, end: endHour * 60, room });
const text = (title: string, summary: string, minutes: number, ...body: string[]): DemoLesson => ({ title, summary, type: "TEXT", minutes, content: p(...body) });
const activity = (title: string, summary: string, minutes: number, ...body: string[]): DemoLesson => ({ title, summary, type: "ACTIVITY", minutes, content: p(...body) });
const video = (title: string, summary: string, minutes: number, url: string): DemoLesson => ({ title, summary, type: "VIDEO", minutes, content: url });

export const MANTENIMIENTO_PC: DemoCourse = {
  code: "INF-101",
  name: "Mantenimiento de Computadoras",
  description: "Arma, diagnostica y repara computadoras de escritorio y laptops. Instala sistemas operativos y deja equipos listos para la oficina.",
  teacher: "victor",
  program: null,
  maxStudents: 40,
  schedule: [slot(2, 14, 16, "Laboratorio de Informática"), slot(4, 14, 16, "Laboratorio de Informática")],
  chapters: [
    {
      title: "Unidad 1. Conoce la computadora por dentro",
      description: "Componentes, seguridad y herramientas.",
      lessons: [
        text("Partes de una computadora", "Placa madre, procesador, memoria, almacenamiento y fuente.", 12,
          "Toda computadora tiene los mismos bloques: la placa madre conecta todo; el procesador (CPU) hace los cálculos; la memoria RAM guarda lo que se está usando; el disco (SSD o HDD) guarda los archivos aunque se apague; y la fuente de poder convierte la corriente de la pared en los voltajes que necesitan las piezas.",
          "Cuando un cliente dice «la computadora está lenta», casi siempre el problema está en uno de estos bloques: poca RAM, un disco mecánico viejo o un procesador que se calienta por falta de limpieza."),
        text("Seguridad antes de abrir un equipo", "Electricidad estática, corriente y orden en la mesa.", 10,
          "Desconecta siempre el equipo y quita la batería de la laptop antes de abrirlo. Toca una parte metálica del chasis o usa una pulsera antiestática: la electricidad estática de tu cuerpo puede dañar la memoria o la placa sin que lo notes.",
          "Trabaja en una mesa limpia, guarda los tornillos en un recipiente por grupos y toma fotos antes de desconectar cables. Así el armado de vuelta es rápido y sin piezas sobrantes."),
        activity("Actividad: inventario de un equipo", "Identifica las piezas de una computadora real.", 25,
          "Con una computadora de la casa, del trabajo o del laboratorio, anota: marca y modelo, procesador, cantidad de RAM, tipo y tamaño del disco, y versión del sistema operativo.",
          "Pista: en Windows abre Configuración → Sistema → Acerca de. Comparte tu tabla en la tarea de la semana."),
      ],
    },
    {
      title: "Unidad 2. Diagnóstico y reparación",
      description: "Encontrar la falla con un método.",
      lessons: [
        text("Método de diagnóstico en cinco pasos", "Escuchar, reproducir, aislar, reparar y comprobar.", 12,
          "1) Escucha al cliente y anota cuándo empezó la falla. 2) Reprodúcela tú mismo. 3) Aísla la causa cambiando una sola cosa a la vez. 4) Repara o reemplaza la pieza. 5) Comprueba con el cliente que todo quedó bien.",
          "Cambiar varias piezas a la vez parece más rápido, pero no sabrás cuál era la falla y el cliente pagará de más."),
        text("Fallas comunes de arranque", "Pitidos, pantalla negra y reinicios.", 14,
          "Si la computadora enciende pero no da imagen, revisa primero la memoria: sácala, limpia los contactos con una goma de borrar y vuelve a colocarla. Los pitidos al encender son códigos del fabricante que indican qué pieza falla.",
          "Los reinicios al azar suelen venir de calor (ventiladores sucios, pasta térmica seca) o de una fuente de poder débil. Un apagón sin protección también puede dañar la fuente: recomienda siempre un UPS."),
        activity("Actividad: limpieza preventiva", "Paso a paso de un mantenimiento preventivo.", 30,
          "Haz la limpieza de un equipo: polvo con aire comprimido, ventiladores, contactos de memoria y revisión de cables.",
          "Anota el antes y el después: temperatura del procesador en reposo y tiempo de arranque."),
      ],
    },
    {
      title: "Unidad 3. Sistema operativo y respaldo",
      description: "Instalar, actualizar y proteger la información.",
      lessons: [
        text("Instalar Windows desde una memoria USB", "Preparar la USB, particiones y controladores.", 15,
          "Antes de formatear, respalda los documentos del cliente. Crea la memoria de instalación con la herramienta oficial, arranca desde la USB y elige instalación personalizada.",
          "Después de instalar, actualiza el sistema, instala los controladores del fabricante y un antivirus. Deja una cuenta de usuario sin permisos de administrador para el uso diario."),
        text("Copias de respaldo", "La regla 3-2-1.", 10,
          "Ten tres copias de la información, en dos medios distintos, y una fuera de la oficina (por ejemplo, en la nube).",
          "Un disco duro puede fallar sin aviso. Un respaldo probado vale más que la mejor reparación."),
        video("Charla: la creatividad en el trabajo técnico", "Ken Robinson habla de cómo aprendemos. Al terminar, escribe en tres líneas cómo la creatividad te ayuda a resolver una falla que nunca habías visto.", 20, "https://www.youtube.com/watch?v=iG9CE55wbtY"),
      ],
    },
  ],
  assignments: [
    {
      title: "Diagnóstico de un caso real",
      instructions: p(
        "Un cliente trae una laptop que se apaga sola después de 20 minutos de uso. Describe, con el método de cinco pasos, cómo encontrarías la falla.",
        "Indica qué preguntas le harías al cliente, qué pruebas harías y qué piezas podrías necesitar.",
      ),
      maxScore: 100,
      answers: [
        "Preguntaría si se calienta y si pasa con el cargador puesto. Reproduciría la falla midiendo la temperatura con HWMonitor. Si pasa de 90 °C, limpiaría el ventilador y cambiaría la pasta térmica. Comprobaría con una prueba de estrés de 30 minutos.",
        "Primero revisaría la batería y el cargador. Luego limpiaría el ventilador. Si sigue igual, revisaría la memoria.",
      ],
    },
    {
      title: "Plan de respaldo para una oficina",
      instructions: p(
        "Una oficina de contabilidad tiene 5 computadoras y nunca ha hecho respaldo. Propón un plan con la regla 3-2-1.",
        "Incluye qué se respalda, cada cuánto, en qué medios y quién lo revisa.",
      ),
      maxScore: 100,
      answers: [
        "Respaldo diario automático de la carpeta Documentos a un disco externo, copia semanal a Google Drive y prueba de recuperación cada mes. Lo revisa la secretaria con una lista de chequeo.",
        "Copiar todo a una USB cada viernes y guardar otra copia en la nube.",
      ],
    },
  ],
  exam: {
    title: "Prueba de componentes y diagnóstico",
    instructions: "Tienes 30 minutos y dos intentos. La última pregunta la revisa el profesor.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué pieza guarda los archivos aunque la computadora se apague?", options: ["La memoria RAM", "El disco (SSD o HDD)", "El procesador", "La fuente de poder"], correctIndex: 1, explanation: "El almacenamiento conserva la información sin corriente." },
      { type: "MULTIPLE_CHOICE", prompt: "Antes de abrir un equipo debes…", options: ["Dejarlo encendido para ver las luces", "Desconectarlo y descargar la estática", "Quitar el sistema operativo", "Cambiar la pasta térmica"], correctIndex: 1, explanation: "Sin corriente y sin estática no se dañan las piezas." },
      { type: "MULTIPLE_CHOICE", prompt: "Una computadora enciende pero no da imagen. ¿Qué revisas primero?", options: ["La memoria RAM", "El antivirus", "El teclado", "La impresora"], correctIndex: 0, explanation: "La memoria mal colocada es la causa más común." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué indica la regla 3-2-1?", options: ["3 antivirus, 2 discos, 1 usuario", "3 copias, 2 medios, 1 fuera de la oficina", "3 discos, 2 USB, 1 laptop", "3 respaldos al año"], correctIndex: 1, explanation: "Tres copias, en dos medios, una fuera del lugar." },
      { type: "TRUE_FALSE", prompt: "Cambiar varias piezas a la vez ayuda a saber cuál era la falla.", answer: "Falso", explanation: "Hay que cambiar una sola cosa a la vez para aislar la causa." },
      { type: "TRUE_FALSE", prompt: "Un UPS protege la fuente de poder durante los apagones.", answer: "Verdadero", explanation: "Mantiene la corriente estable y da tiempo para apagar." },
    ],
    shortAnswer: {
      prompt: "Explica con tus palabras por qué una computadora sucia se reinicia sola.",
      answer: "El polvo tapa los ventiladores y disipadores; el procesador se calienta y el equipo se apaga o reinicia para protegerse.",
      explanation: "El calor es una de las causas más comunes de reinicios.",
      samples: [
        "Porque el polvo no deja que el ventilador saque el calor; el procesador se sobrecalienta y la placa apaga el equipo para que no se dañe.",
        "Por el calor, el polvo calienta la computadora.",
        "Porque tiene virus.",
      ],
    },
  },
  liveClass: {
    title: "Consultorio en vivo: trae tu falla",
    description: "Conéctate con la computadora que te está dando problemas y la revisamos juntos.",
    time: "16:30",
    durationMinutes: 60,
    daysFromToday: 2,
    weeks: 3,
  },
};

export const ELECTRICIDAD_RESIDENCIAL: DemoCourse = {
  code: "ELE-101",
  name: "Electricidad Residencial",
  description: "Circuitos, ley de Ohm, cableado y protección de una vivienda según las buenas prácticas del país.",
  teacher: "domingo",
  program: null,
  maxStudents: 40,
  schedule: [slot(1, 14, 16, "Taller de Electricidad"), slot(3, 14, 16, "Taller de Electricidad")],
  chapters: [
    {
      title: "Unidad 1. Conceptos básicos",
      description: "Voltaje, corriente, resistencia y potencia.",
      lessons: [
        text("Voltaje, corriente y resistencia", "Las tres magnitudes de todo circuito.", 12,
          "El voltaje (V, en voltios) es el empuje que mueve la electricidad; la corriente (I, en amperios) es cuánta electricidad pasa; la resistencia (R, en ohmios) es cuánto se opone el material al paso.",
          "En las casas dominicanas la tensión normal es de 120 V para tomacorrientes y 240 V para equipos grandes como aires acondicionados y calentadores."),
        text("La ley de Ohm y la potencia", "V = I × R y P = V × I.", 14,
          "La ley de Ohm dice que el voltaje es igual a la corriente por la resistencia: V = I × R. Si conoces dos valores, calculas el tercero.",
          "La potencia (P, en vatios) es P = V × I. Un abanico de 120 V que consume 0.5 A usa 60 W. Así calculas qué breaker y qué calibre de cable necesita cada circuito."),
        activity("Actividad: consumo de mi casa", "Calcula la potencia de tus equipos.", 25,
          "Busca la etiqueta de cinco equipos de tu casa (nevera, abanico, televisor, plancha, cargador) y anota voltaje y potencia.",
          "Calcula la corriente de cada uno con I = P ÷ V y súmalas. ¿Aguantaría un breaker de 20 A si todos estuvieran encendidos a la vez?"),
      ],
    },
    {
      title: "Unidad 2. Instalación de circuitos",
      description: "Cables, tomacorrientes e interruptores.",
      lessons: [
        text("Colores y calibres de cable", "Fase, neutro y tierra.", 10,
          "Usa los colores de forma constante: negro o rojo para la fase, blanco para el neutro y verde o desnudo para la tierra. El calibre (AWG) depende de la corriente: 14 AWG para alumbrado (15 A) y 12 AWG para tomacorrientes (20 A).",
          "Un cable más delgado de lo necesario se calienta y puede provocar un incendio."),
        text("Interruptor sencillo y de tres vías", "Controlar una lámpara desde uno o dos lugares.", 15,
          "El interruptor siempre corta la fase, nunca el neutro. Con dos interruptores de tres vías puedes encender la luz de un pasillo desde cada extremo.",
          "Dibuja el diagrama antes de cablear y verifica con el multímetro que no hay tensión antes de tocar los cables."),
        activity("Actividad: diagrama de una habitación", "Plano eléctrico sencillo.", 30,
          "Dibuja el plano de tu habitación con dos tomacorrientes, una lámpara de techo y su interruptor.",
          "Marca el recorrido de fase, neutro y tierra y el breaker que usarías."),
      ],
    },
    {
      title: "Unidad 3. Protección y seguridad",
      description: "Breakers, puesta a tierra y trabajo seguro.",
      lessons: [
        text("Breakers y panel eléctrico", "Cada circuito con su protección.", 12,
          "El breaker corta la corriente cuando pasa de su valor. Nunca se cambia un breaker que «salta» por uno más grande: hay que buscar la causa (sobrecarga o cortocircuito).",
          "En baños y cocinas se recomiendan tomacorrientes GFCI, que cortan en milésimas de segundo si detectan una fuga."),
        text("Puesta a tierra", "Por qué la tierra salva vidas.", 10,
          "La tierra da un camino seguro a la corriente cuando un equipo tiene una falla. Sin tierra, esa corriente puede pasar por la persona que toca el equipo.",
          "Mide la resistencia de la varilla de tierra con el instrumento adecuado y deja el valor anotado en el panel."),
        activity("Actividad: inspección de seguridad", "Lista de chequeo de una vivienda.", 20,
          "Revisa una vivienda con la lista: empalmes sin cinta, tomacorrientes flojos, breakers sin rotular, extensiones permanentes.",
          "Toma fotos (sin tocar nada energizado) y propón la corrección de cada punto."),
      ],
    },
  ],
  assignments: [
    {
      title: "Cálculo de un circuito de cocina",
      instructions: p(
        "En una cocina se conectarán una nevera de 400 W, un microondas de 1,200 W y una licuadora de 600 W, todos a 120 V.",
        "Calcula la corriente total, indica el breaker y el calibre de cable que usarías y explica por qué.",
      ),
      maxScore: 100,
      answers: [
        "Potencia total 2,200 W. I = 2,200 ÷ 120 = 18.3 A. Usaría breaker de 20 A con cable 12 AWG, y separaría el microondas en su propio circuito para no trabajar al límite.",
        "Son 2,200 W, más o menos 18 A. Breaker de 20 A y cable 14.",
      ],
    },
    {
      title: "Diagrama de interruptor de tres vías",
      instructions: p(
        "Dibuja el diagrama de una lámpara de pasillo controlada desde dos lugares con interruptores de tres vías.",
        "Marca fase, neutro, tierra y los viajeros. Puedes tomar una foto de tu dibujo y pegar el enlace.",
      ),
      maxScore: 100,
      answers: [
        "Fase al común del primer interruptor, dos viajeros entre los interruptores, común del segundo a la lámpara, neutro directo a la lámpara y tierra a las cajas. Enlace a la foto del dibujo en la descripción.",
        "Hice el dibujo con los dos interruptores y la lámpara.",
      ],
    },
  ],
  exam: {
    title: "Parcial: ley de Ohm y circuitos",
    instructions: "Tienes 30 minutos y dos intentos. Puedes usar calculadora.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "Según la ley de Ohm, V es igual a…", options: ["I ÷ R", "I × R", "P × R", "R ÷ I"], correctIndex: 1, explanation: "El voltaje es corriente por resistencia." },
      { type: "MULTIPLE_CHOICE", prompt: "Un equipo de 1,200 W a 120 V consume…", options: ["1 A", "10 A", "100 A", "12 A"], correctIndex: 1, explanation: "I = P ÷ V = 1,200 ÷ 120 = 10 A." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué color se usa para el neutro?", options: ["Negro", "Rojo", "Blanco", "Verde"], correctIndex: 2, explanation: "El blanco identifica al neutro." },
      { type: "MULTIPLE_CHOICE", prompt: "El interruptor de una lámpara debe cortar…", options: ["El neutro", "La tierra", "La fase", "Cualquiera"], correctIndex: 2, explanation: "Cortar la fase deja la lámpara sin tensión." },
      { type: "TRUE_FALSE", prompt: "Si un breaker salta seguido, lo correcto es cambiarlo por uno más grande.", answer: "Falso", explanation: "Hay que buscar la sobrecarga o el cortocircuito." },
      { type: "TRUE_FALSE", prompt: "Los tomacorrientes GFCI se recomiendan en baños y cocinas.", answer: "Verdadero", explanation: "Cortan rápido ante una fuga a tierra." },
    ],
    shortAnswer: {
      prompt: "¿Para qué sirve la puesta a tierra en una vivienda?",
      answer: "Da un camino seguro a la corriente de falla para que no pase por las personas y para que actúen las protecciones.",
      explanation: "La tierra protege a las personas ante fallas de aislamiento.",
      samples: [
        "Para que si un equipo tiene una falla la corriente se vaya a tierra y no a la persona que lo toca, y así salte el breaker.",
        "Para proteger los equipos de la casa.",
        "Para que la luz no se vaya.",
      ],
    },
  },
  liveClass: {
    title: "Taller en vivo: uso del multímetro",
    description: "Ten a mano tu multímetro: mediremos voltaje, continuidad y resistencia.",
    time: "17:00",
    durationMinutes: 60,
    daysFromToday: 1,
    weeks: 3,
  },
};

export const ENERGIA_SOLAR: DemoCourse = {
  code: "ELE-102",
  name: "Instalaciones Solares Fotovoltaicas",
  description: "Paneles, inversores y baterías: dimensiona e instala un sistema solar para una casa o un negocio pequeño.",
  teacher: "fausto",
  program: null,
  maxStudents: 35,
  schedule: [slot(2, 16, 18, "Taller de Electricidad"), slot(6, 8, 10, "Azotea del edificio B")],
  chapters: [
    {
      title: "Unidad 1. El sol como fuente de energía",
      description: "Radiación, horas sol pico y tipos de sistemas.",
      lessons: [
        text("Horas sol pico", "Cuánta energía da el sol en el país.", 10,
          "Las horas sol pico (HSP) resumen la radiación de un día como si el sol diera 1,000 W por metro cuadrado durante esas horas. En la República Dominicana el promedio está entre 5 y 6 HSP.",
          "Con ese dato se calcula cuánta energía produce un panel: un panel de 550 W en un lugar con 5 HSP produce cerca de 2.75 kWh al día, antes de pérdidas."),
        text("Sistemas en red, aislados e híbridos", "Cuál conviene en cada caso.", 12,
          "El sistema en red (net metering) se conecta a la distribuidora y no usa baterías. El aislado depende de baterías y sirve donde no llega la red. El híbrido combina ambos y da respaldo en los apagones.",
          "Para la mayoría de las casas con apagones frecuentes, el híbrido es la opción más pedida."),
        activity("Actividad: factura de luz", "Lee el consumo de una factura.", 20,
          "Toma una factura de luz y anota el consumo en kWh de los últimos meses. Calcula el promedio diario.",
          "Ese número es el punto de partida para dimensionar el sistema."),
      ],
    },
    {
      title: "Unidad 2. Dimensionar el sistema",
      description: "Paneles, inversor y baterías.",
      lessons: [
        text("¿Cuántos paneles necesito?", "Consumo diario ÷ (HSP × potencia del panel × rendimiento).", 14,
          "Si una casa consume 10 kWh al día, con 5 HSP y paneles de 550 W con un rendimiento del 80 %: 10 ÷ (5 × 0.55 × 0.8) ≈ 4.5, es decir, 5 paneles.",
          "Redondea siempre hacia arriba y verifica que el techo tenga espacio y sombra mínima."),
        text("Inversor y baterías", "Potencia de picos y días de autonomía.", 14,
          "El inversor se elige por la potencia que se usa a la vez (por ejemplo, nevera + abanicos + bomba de agua) y debe aguantar el arranque de los motores.",
          "Las baterías se calculan por la energía que se quiere tener en un apagón y por su profundidad de descarga. Las de litio permiten usar casi toda su capacidad."),
        activity("Actividad: propuesta para un colmado", "Dimensiona un sistema híbrido.", 30,
          "Un colmado consume 18 kWh al día y quiere 4 horas de respaldo para dos neveras (800 W en total).",
          "Calcula paneles, inversor y baterías y explica tus supuestos."),
      ],
    },
    {
      title: "Unidad 3. Instalación y mantenimiento",
      description: "Montaje seguro y revisión periódica.",
      lessons: [
        text("Montaje y orientación", "Inclinación, sombra y fijación.", 12,
          "En el país los paneles rinden mejor orientados al sur con una inclinación de 15 a 20 grados. Una sombra pequeña sobre un panel baja la producción de toda la cadena.",
          "Las estructuras deben resistir vientos de huracán: usa anclajes adecuados y revisa la azotea antes de perforar."),
        text("Mantenimiento", "Limpieza y revisión de conexiones.", 10,
          "Limpia los paneles con agua y un paño suave cada uno o dos meses, temprano en la mañana. Revisa conectores, protecciones y el registro del inversor.",
          "Anota la producción mensual: una caída brusca indica suciedad, sombra nueva o una falla."),
        activity("Actividad: plan de mantenimiento", "Lista de chequeo trimestral.", 20,
          "Prepara una lista de chequeo para entregar al cliente con las tareas de cada mes y de cada trimestre.",
          "Incluye a quién llamar si el inversor muestra una alarma."),
      ],
    },
  ],
  assignments: [
    {
      title: "Dimensionar una vivienda",
      instructions: p(
        "Una vivienda consume 300 kWh al mes. Con 5 HSP y paneles de 550 W, calcula cuántos paneles necesita un sistema en red.",
        "Muestra el cálculo y di cuánto techo ocuparían si cada panel mide 2.3 m².",
      ),
      maxScore: 100,
      answers: [
        "300 ÷ 30 = 10 kWh/día. 10 ÷ (5 × 0.55 × 0.8) = 4.5 → 5 paneles. Ocupan 5 × 2.3 = 11.5 m², más espacio para pasillos de mantenimiento.",
        "Necesita 5 paneles más o menos.",
      ],
    },
    {
      title: "Comparar sistema en red e híbrido",
      instructions: p(
        "Un cliente de Santiago tiene apagones de 4 horas casi todos los días. Compara para él un sistema en red y uno híbrido.",
        "Explica ventajas, costos aproximados y cuál le recomendarías.",
      ),
      maxScore: 100,
      answers: [
        "El sistema en red es más barato pero no funciona en el apagón. El híbrido cuesta más por las baterías, pero mantiene neveras y abanicos. Le recomendaría el híbrido con baterías de litio para 4 horas.",
        "Le recomiendo el híbrido porque tiene baterías.",
      ],
    },
  ],
  exam: {
    title: "Prueba de dimensionamiento solar",
    instructions: "Tienes 30 minutos y dos intentos. Puedes usar calculadora.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué sistema sigue funcionando durante un apagón?", options: ["En red sin baterías", "Híbrido", "Ninguno", "Solo el de agua caliente"], correctIndex: 1, explanation: "El híbrido tiene baterías de respaldo." },
      { type: "MULTIPLE_CHOICE", prompt: "Un panel de 500 W con 5 HSP produce al día, sin pérdidas…", options: ["0.5 kWh", "2.5 kWh", "25 kWh", "5 kWh"], correctIndex: 1, explanation: "0.5 kW × 5 h = 2.5 kWh." },
      { type: "MULTIPLE_CHOICE", prompt: "En el país los paneles se orientan preferiblemente hacia el…", options: ["Norte", "Sur", "Este", "Oeste"], correctIndex: 1, explanation: "Estamos en el hemisferio norte: mirar al sur capta más sol." },
      { type: "MULTIPLE_CHOICE", prompt: "El inversor se elige principalmente por…", options: ["El color", "La potencia que se usa a la vez", "La cantidad de baterías", "El largo del cable"], correctIndex: 1, explanation: "Debe aguantar la carga simultánea y los arranques." },
      { type: "TRUE_FALSE", prompt: "Una sombra pequeña sobre un panel puede bajar la producción de toda la cadena.", answer: "Verdadero", explanation: "Los paneles en serie se limitan por el más débil." },
      { type: "TRUE_FALSE", prompt: "Los paneles no necesitan ningún mantenimiento.", answer: "Falso", explanation: "Hay que limpiarlos y revisar conexiones." },
    ],
    shortAnswer: {
      prompt: "Explica qué son las horas sol pico y para qué se usan.",
      answer: "Son las horas equivalentes de sol a 1,000 W/m² en un día; se usan para calcular cuánta energía producen los paneles.",
      explanation: "Las HSP permiten dimensionar el sistema.",
      samples: [
        "Es la radiación del día resumida como horas a 1,000 W por metro cuadrado. Con eso se calcula cuántos kWh da un panel y cuántos paneles hacen falta.",
        "Son las horas que hay sol fuerte.",
        "Las horas en que el panel está prendido.",
      ],
    },
  },
  liveClass: {
    title: "Visita virtual a una instalación híbrida",
    description: "Recorremos en vivo un sistema instalado en un colmado de Villa Mella.",
    time: "10:30",
    durationMinutes: 60,
    daysFromToday: 3,
    weeks: 2,
  },
};

export const MERCADEO_DIGITAL: DemoCourse = {
  code: "MER-101",
  name: "Mercadeo Digital para Emprendedores",
  description: "Vende más con redes sociales, WhatsApp Business y contenido que conecta. Curso práctico, abierto al público.",
  teacher: "lissette",
  program: null,
  maxStudents: 50,
  schedule: [slot(2, 18, 20, "Aula 301"), slot(4, 18, 20, "Aula 301")],
  catalogPriceCents: 280000,
  chapters: [
    {
      title: "Unidad 1. Conoce a tu cliente",
      description: "Público objetivo y propuesta de valor.",
      lessons: [
        text("¿A quién le vendes?", "Define a tu cliente ideal.", 10,
          "Antes de publicar, describe a tu cliente: edad, dónde vive, qué le preocupa y en qué red pasa más tiempo. No es lo mismo venderle bizcochos a madres de Santiago que repuestos a mecánicos de la capital.",
          "Escribe esa descripción en una ficha y tenla a mano cada vez que prepares una publicación."),
        video("Video: empieza por el porqué", "Simon Sinek explica por qué las marcas que comunican su propósito conectan mejor. Míralo completo (18 minutos).", 18, "https://www.youtube.com/watch?v=qp0HIF3SfI4"),
        activity("Actividad: ficha de cliente ideal", "Describe a tu cliente en una página.", 20,
          "Completa la ficha de tu cliente ideal para tu negocio o uno inventado: datos, problemas, deseos y dónde lo encuentras.",
          "Agrega tu propuesta de valor en una sola frase: «Ayudo a ___ a ___ gracias a ___»."),
      ],
    },
    {
      title: "Unidad 2. Contenido que vende",
      description: "Publicaciones, historias y calendario.",
      lessons: [
        text("La regla 80/20 del contenido", "Aporta valor antes de vender.", 12,
          "De cada 10 publicaciones, unas 8 deben educar, entretener o inspirar, y solo 2 pedir la compra directamente. Así la gente sigue tu cuenta porque le sirve, no solo por las ofertas.",
          "Ejemplos de contenido de valor: consejos de uso, antes y después, testimonios de clientes y detrás de cámaras."),
        text("Calendario de publicaciones", "Constancia por encima de cantidad.", 10,
          "Es mejor publicar tres veces por semana todas las semanas que diez veces una semana y nada el mes siguiente. Planifica el mes en una hoja con fecha, red, tema y texto.",
          "Revisa cada viernes qué publicación tuvo más mensajes y repite ese tipo de contenido."),
        activity("Actividad: calendario de dos semanas", "Planifica seis publicaciones.", 25,
          "Prepara un calendario de seis publicaciones para dos semanas, siguiendo la regla 80/20.",
          "Para cada una indica el objetivo, el texto y la imagen o video que usarías."),
      ],
    },
    {
      title: "Unidad 3. Vender por WhatsApp",
      description: "Catálogo, respuestas rápidas y seguimiento.",
      lessons: [
        text("WhatsApp Business", "Perfil, catálogo y etiquetas.", 12,
          "Completa el perfil con horario, ubicación y enlace al catálogo. Usa etiquetas (nuevo cliente, pedido, pagado) para no perder conversaciones.",
          "Configura un mensaje de bienvenida y respuestas rápidas para precios y formas de pago."),
        text("Medir resultados", "Mensajes, ventas y costo por cliente.", 10,
          "Mide cada semana cuántos mensajes recibiste, cuántos compraron y cuánto invertiste en anuncios. Si gastaste RD$2,000 y conseguiste 10 clientes, cada cliente te costó RD$200.",
          "Con esos números decides qué anuncio repetir y cuál apagar."),
        activity("Actividad: guion de venta", "Del primer mensaje al pago.", 20,
          "Escribe el guion de una conversación de venta por WhatsApp: saludo, preguntas, oferta, forma de pago y seguimiento.",
          "Pruébalo con un compañero y ajusta lo que no suene natural."),
      ],
    },
  ],
  assignments: [
    {
      title: "Ficha de cliente y propuesta de valor",
      instructions: p(
        "Entrega la ficha de cliente ideal de tu negocio (o uno inventado) y tu propuesta de valor en una frase.",
        "Explica en qué red social está ese cliente y por qué.",
      ),
      maxScore: 100,
      answers: [
        "Negocio: reposteria Dulce Hogar. Cliente: madres de 28 a 45 años de Santiago que celebran cumpleaños en casa; usan Instagram y WhatsApp. Propuesta: Ayudo a las mamás ocupadas a celebrar sin estrés con bizcochos personalizados entregados a domicilio.",
        "Mi cliente son jóvenes que usan TikTok. Vendo ropa.",
      ],
    },
    {
      title: "Calendario de contenido de un mes",
      instructions: p(
        "Prepara el calendario de contenido de un mes para tu negocio: 12 publicaciones con fecha, red, objetivo y texto.",
        "Marca cuáles son de valor y cuáles de venta.",
      ),
      maxScore: 100,
      answers: [
        "Adjunto mi calendario en Google Sheets con 12 publicaciones: 9 de valor (consejos, testimonios, proceso) y 3 de venta con oferta de temporada.",
        "Voy a publicar todos los días ofertas.",
      ],
    },
  ],
  exam: {
    title: "Prueba de mercadeo digital",
    instructions: "Tienes 30 minutos y dos intentos.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "Según la regla 80/20, ¿cuántas de 10 publicaciones deberían pedir la compra?", options: ["8", "2", "5", "10"], correctIndex: 1, explanation: "La mayoría aporta valor; solo unas pocas venden directamente." },
      { type: "MULTIPLE_CHOICE", prompt: "Gastaste RD$3,000 en anuncios y conseguiste 15 clientes. ¿Cuánto costó cada cliente?", options: ["RD$150", "RD$200", "RD$300", "RD$45"], correctIndex: 1, explanation: "3,000 ÷ 15 = 200." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué herramienta de WhatsApp Business ayuda a no perder conversaciones?", options: ["Las etiquetas", "Los estados", "Las llamadas", "Los stickers"], correctIndex: 0, explanation: "Las etiquetas ordenan los chats por etapa." },
      { type: "MULTIPLE_CHOICE", prompt: "Lo primero antes de publicar es…", options: ["Comprar seguidores", "Definir a tu cliente ideal", "Hacer un logo nuevo", "Bajar los precios"], correctIndex: 1, explanation: "Saber a quién le hablas guía todo lo demás." },
      { type: "TRUE_FALSE", prompt: "Publicar con constancia es más importante que publicar mucho una sola semana.", answer: "Verdadero", explanation: "La constancia genera confianza." },
      { type: "TRUE_FALSE", prompt: "Los testimonios de clientes son contenido de venta directa.", answer: "Falso", explanation: "Son contenido de valor que genera confianza." },
    ],
    shortAnswer: {
      prompt: "Escribe la propuesta de valor de tu negocio en una frase y explica por qué es clara.",
      answer: "Una frase del tipo «Ayudo a [cliente] a [resultado] gracias a [diferencia]», específica y fácil de entender.",
      explanation: "Una buena propuesta dice para quién, qué resultado y por qué tú.",
      samples: [
        "Ayudo a los mecánicos del Cibao a conseguir repuestos en 24 horas gracias a nuestro almacén en Santiago. Es clara porque dice a quién, qué gana y por qué nosotros.",
        "Vendemos los mejores productos a buen precio.",
        "Mi negocio es bueno.",
      ],
    },
  },
  liveClass: {
    title: "Clínica de perfiles: revisamos tu Instagram",
    description: "Comparte el enlace de tu cuenta y la revisamos en vivo.",
    time: "19:00",
    durationMinutes: 60,
    daysFromToday: 0,
    weeks: 3,
  },
};

export const SERVICIO_AL_TURISTA: DemoCourse = {
  code: "TUR-101",
  name: "Servicio al Turista y Hospitalidad",
  description: "Atención de calidad para hoteles, restaurantes y excursiones: comunicación, manejo de quejas e inglés básico de servicio.",
  teacher: "yahaira",
  program: null,
  maxStudents: 40,
  schedule: [slot(1, 16, 18, "Aula 302"), slot(5, 16, 18, "Aula 302")],
  chapters: [
    {
      title: "Unidad 1. El turismo en el país",
      description: "Destinos, perfil del visitante y empleo.",
      lessons: [
        text("El turismo dominicano", "Destinos y tipos de visitante.", 10,
          "El turismo es una de las principales fuentes de empleo del país. Punta Cana y Bávaro concentran el turismo de sol y playa, Samaná el ecoturismo y las ballenas, y la Zona Colonial el turismo cultural.",
          "Cada visitante espera algo distinto: el de todo incluido busca comodidad; el de excursión, experiencias auténticas y seguras."),
        text("La primera impresión", "Saludo, imagen y actitud.", 10,
          "El visitante decide en segundos si se siente bienvenido. Saluda mirando a los ojos, con una sonrisa y presentándote por tu nombre.",
          "Uniforme limpio, gafete visible y postura abierta comunican profesionalismo antes de decir una palabra."),
        activity("Actividad: mapa de experiencias", "Recorre un destino como visitante.", 20,
          "Elige un destino del país y describe el recorrido de un turista desde que llega al aeropuerto hasta que se va.",
          "Marca los momentos donde un buen servicio hace la diferencia."),
      ],
    },
    {
      title: "Unidad 2. Comunicación y quejas",
      description: "Escuchar, resolver y dar seguimiento.",
      lessons: [
        text("Escucha activa", "Entender antes de responder.", 10,
          "Deja que el cliente termine, repite con tus palabras lo que entendiste y pregunta lo que falta. Evita frases como «eso no es mi departamento».",
          "La escucha activa baja la tensión y evita que una pequeña molestia se convierta en una mala reseña."),
        text("Manejo de quejas con el método LAST", "Escuchar, disculparse, resolver y agradecer.", 12,
          "L (listen): escucha sin interrumpir. A (apologize): discúlpate por la experiencia. S (solve): ofrece una solución concreta y un plazo. T (thank): agradece que te lo haya dicho.",
          "Después de resolver, da seguimiento: una llamada o una visita a la habitación demuestra que de verdad te importa."),
        activity("Actividad: juego de roles", "Practica una queja difícil.", 25,
          "En parejas, uno es el huésped molesto porque su habitación no está lista y el otro aplica el método LAST.",
          "Cambien de papel y anoten qué frases funcionaron mejor."),
      ],
    },
    {
      title: "Unidad 3. Inglés de servicio",
      description: "Frases clave para recibir y orientar.",
      lessons: [
        text("Frases para recibir al huésped", "Welcome, check-in y orientación.", 12,
          "Welcome to the hotel! May I have your name, please? Your room is on the third floor. Breakfast is served from 7 to 10 a. m.",
          "Practica la pronunciación en voz alta y ten una tarjeta con las frases más usadas en tu área."),
        text("Orientar y recomendar", "Indicaciones y sugerencias.", 10,
          "The restaurant is next to the pool. I recommend the boat tour to Saona Island. Would you like me to book it for you?",
          "Una recomendación sincera de un lugar local mejora la experiencia y deja una buena reseña."),
        activity("Actividad: grabación de bienvenida", "Graba tu bienvenida en inglés.", 15,
          "Graba un audio de un minuto dando la bienvenida a un huésped y explicando los horarios del hotel.",
          "Comparte el enlace en la tarea de la semana."),
      ],
    },
  ],
  assignments: [
    {
      title: "Caso: la reservación perdida",
      instructions: p(
        "Una familia llega a las 11:00 p. m. y su reservación no aparece. Describe cómo la atenderías con el método LAST.",
        "Incluye las frases exactas que usarías y qué solución ofrecerías.",
      ),
      maxScore: 100,
      answers: [
        "Escucho sin interrumpir, me disculpo: «Lamento mucho este inconveniente después de un viaje largo». Ofrezco una habitación disponible mientras verificamos con la agencia y un refrigerio. Agradezco su paciencia y al día siguiente llamo para confirmar que todo está bien.",
        "Le diría que espere mientras llamo al gerente.",
      ],
    },
    {
      title: "Guion de bienvenida en inglés",
      instructions: p(
        "Escribe el guion de bienvenida de un huésped en inglés: saludo, check-in, horarios y una recomendación local.",
        "Mínimo ocho frases.",
      ),
      maxScore: 100,
      answers: [
        "Good evening and welcome to Hotel Coral! May I have your name, please? ... I recommend the boat tour to Saona Island. Enjoy your stay!",
        "Hello, welcome. Your room is 203.",
      ],
    },
  ],
  exam: {
    title: "Prueba de servicio al cliente",
    instructions: "Tienes 30 minutos y dos intentos.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué significa la A del método LAST?", options: ["Atender", "Disculparse (apologize)", "Anotar", "Avisar"], correctIndex: 1, explanation: "Listen, Apologize, Solve, Thank." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué destino es conocido por el avistamiento de ballenas?", options: ["Samaná", "Jarabacoa", "Barahona", "Santiago"], correctIndex: 0, explanation: "Las ballenas jorobadas llegan a la bahía de Samaná." },
      { type: "MULTIPLE_CHOICE", prompt: "«Breakfast is served from 7 to 10» significa…", options: ["La cena es de 7 a 10", "El desayuno se sirve de 7 a 10", "La piscina abre a las 7", "El check-out es a las 10"], correctIndex: 1, explanation: "Breakfast = desayuno." },
      { type: "MULTIPLE_CHOICE", prompt: "Ante una queja, lo primero es…", options: ["Explicar las reglas", "Escuchar sin interrumpir", "Llamar a seguridad", "Ofrecer un descuento"], correctIndex: 1, explanation: "Escuchar baja la tensión y aclara el problema." },
      { type: "TRUE_FALSE", prompt: "Decir «eso no es mi departamento» es una buena respuesta si no sabes algo.", answer: "Falso", explanation: "Lo correcto es buscar quién lo resuelve y acompañar al cliente." },
      { type: "TRUE_FALSE", prompt: "Dar seguimiento después de resolver una queja mejora la experiencia del huésped.", answer: "Verdadero", explanation: "Demuestra interés real." },
    ],
    shortAnswer: {
      prompt: "Un huésped se queja del ruido de una fiesta. Escribe qué le dirías.",
      answer: "Escuchar, disculparse, ofrecer una solución concreta (cambio de habitación o hablar con los responsables) y agradecer, con seguimiento.",
      explanation: "Se espera el método LAST con una solución concreta.",
      samples: [
        "Le escucho, le pido disculpas por la molestia, le ofrezco cambiarlo a una habitación en el otro edificio o hablar ya con el área del evento, y le agradezco que nos avisara. Luego llamo para ver si pudo descansar.",
        "Le pido disculpas y le digo que ya mismo bajan la música.",
        "Le digo que así es el hotel.",
      ],
    },
  },
  liveClass: {
    title: "Práctica en vivo: check-in en inglés",
    description: "Simulamos llegadas de huéspedes con situaciones reales.",
    time: "18:30",
    durationMinutes: 60,
    daysFromToday: 1,
    weeks: 3,
  },
};

export const TECHNICAL_COURSES: DemoCourse[] = [MANTENIMIENTO_PC, ELECTRICIDAD_RESIDENCIAL, ENERGIA_SOLAR, MERCADEO_DIGITAL, SERVICIO_AL_TURISTA];
