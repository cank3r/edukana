import { paragraphs as p, type DemoCourse } from "./types";

/** Cursos del programa «Técnico en Enfermería». */

const morning = (weekday: number, room: string) => ({ weekday, start: 8 * 60, end: 10 * 60, room });

export const ANATOMIA: DemoCourse = {
  code: "ENF-101",
  name: "Anatomía y Fisiología Básica",
  description: "Cómo está formado el cuerpo humano y cómo funcionan sus principales sistemas. Base para todas las materias de enfermería.",
  teacher: "rosa",
  program: "ENF",
  maxStudents: 30,
  schedule: [morning(1, "Aula 101"), morning(3, "Aula 101")],
  chapters: [
    {
      title: "Unidad 1. Organización del cuerpo humano",
      description: "Niveles de organización, posición anatómica y términos de ubicación.",
      lessons: [
        {
          title: "De la célula al organismo",
          summary: "Los niveles de organización del cuerpo y por qué importan en el cuidado del paciente.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "El cuerpo humano se organiza en niveles que van de lo más simple a lo más complejo: células, tejidos, órganos, sistemas y, finalmente, el organismo completo. La célula es la unidad básica de la vida; cada una cumple funciones como producir energía, eliminar desechos y reproducirse.",
            "Cuando muchas células parecidas trabajan juntas forman un tejido. Existen cuatro tipos principales: epitelial (recubre superficies, como la piel), conectivo (sostiene y une, como el hueso y la sangre), muscular (permite el movimiento) y nervioso (transmite información).",
            "Varios tejidos forman un órgano, como el corazón o el estómago, y varios órganos que trabajan por un mismo fin forman un sistema: el digestivo, el respiratorio o el cardiovascular. En enfermería pensamos así porque una falla en un nivel afecta a los demás: una infección en la piel (tejido) puede llegar a la sangre y comprometer todo el organismo.",
          ),
        },
        {
          title: "Posición anatómica y planos del cuerpo",
          summary: "El lenguaje común que usa todo el equipo de salud para describir dónde está algo.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Para que todo el equipo de salud se entienda, el cuerpo se describe siempre desde la posición anatómica: de pie, mirando al frente, brazos a los lados y palmas de las manos hacia adelante. Aunque el paciente esté acostado, las descripciones se hacen como si estuviera en esa posición.",
            "Los planos imaginarios dividen el cuerpo: el plano sagital lo separa en derecha e izquierda; el frontal (o coronal), en parte anterior y posterior; y el transversal, en parte superior e inferior. Las tomografías y otros estudios de imagen usan estos mismos planos.",
            "Términos que usarás todos los días: anterior (hacia el frente) y posterior (hacia atrás); medial (hacia la línea media) y lateral (hacia el lado); proximal (más cerca del tronco) y distal (más lejos). Por ejemplo: «herida de 3 cm en la cara anterior del antebrazo derecho, en su tercio distal».",
          ),
        },
        {
          title: "Actividad: describe la ubicación",
          summary: "Practica los términos de ubicación con casos de la vida real.",
          type: "ACTIVITY",
          minutes: 20,
          content: p(
            "Escribe en tu cuaderno la descripción correcta de cada caso usando la posición anatómica y los términos de ubicación:",
            "1. Un paciente tiene un moretón en la parte de atrás de la pierna izquierda, cerca de la rodilla.\n2. La vía periférica está colocada en el dorso de la mano derecha.\n3. Una quemadura cubre la parte de adelante del muslo, más cerca de la cadera que de la rodilla.\n4. El ombligo, ¿es medial o lateral respecto a las caderas?",
            "Trae tus respuestas a la clase del lunes; las revisaremos en parejas.",
          ),
        },
      ],
    },
    {
      title: "Unidad 2. Sistema cardiovascular",
      description: "El corazón, los vasos sanguíneos y la circulación.",
      lessons: [
        {
          title: "Video: cómo funciona el corazón",
          summary: "Mira este repaso de la anatomía del sistema circulatorio. Anota las cuatro cavidades del corazón y el camino que sigue la sangre.",
          type: "VIDEO",
          minutes: 10,
          content: "https://www.youtube.com/watch?v=KWf1XkE9Jr8",
        },
        {
          title: "Circulación mayor y menor",
          summary: "El recorrido completo de la sangre en dos circuitos.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "El corazón tiene cuatro cavidades: dos aurículas arriba y dos ventrículos abajo. El lado derecho recibe la sangre pobre en oxígeno que viene del cuerpo y la envía a los pulmones; el lado izquierdo recibe la sangre oxigenada de los pulmones y la impulsa hacia todo el organismo.",
            "La circulación menor (pulmonar) va del ventrículo derecho a los pulmones por la arteria pulmonar, y regresa a la aurícula izquierda por las venas pulmonares. Allí la sangre suelta el dióxido de carbono y toma oxígeno.",
            "La circulación mayor (sistémica) sale del ventrículo izquierdo por la aorta, llega a todos los tejidos y vuelve a la aurícula derecha por las venas cavas. Por eso el ventrículo izquierdo tiene la pared más gruesa: es el que hace más fuerza.",
            "Recuerda: las arterias salen del corazón y las venas llegan a él. No se definen por el color de la sangre, sino por la dirección en que la llevan.",
          ),
        },
        {
          title: "El pulso y la presión arterial",
          summary: "Qué miden y por qué cambian.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Cada vez que el ventrículo izquierdo se contrae, empuja sangre a las arterias y produce una onda que podemos palpar: el pulso. Los sitios más usados son el radial (muñeca), el carotídeo (cuello) y el braquial (pliegue del codo). En un adulto en reposo lo normal es entre 60 y 100 latidos por minuto.",
            "La presión arterial es la fuerza que ejerce la sangre sobre las paredes de las arterias. Se anota con dos números: la sistólica (cuando el corazón se contrae) y la diastólica (cuando se relaja). Una presión menor de 120/80 mmHg se considera normal en un adulto.",
            "El ejercicio, el dolor, la fiebre, el miedo y algunos medicamentos cambian el pulso y la presión. Por eso siempre se anotan junto con la hora y la situación del paciente, por ejemplo: «PA 135/85 mmHg, paciente ansioso antes de la cirugía».",
          ),
        },
      ],
    },
    {
      title: "Unidad 3. Sistema respiratorio",
      description: "Vías respiratorias, pulmones e intercambio de gases.",
      lessons: [
        {
          title: "Vías respiratorias altas y bajas",
          summary: "El camino del aire desde la nariz hasta los alvéolos.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Las vías respiratorias altas son la nariz, la boca, la faringe y la laringe. Calientan, humedecen y filtran el aire. La epiglotis, en la laringe, funciona como una tapa que se cierra al tragar para que los alimentos no pasen a los pulmones.",
            "Las vías bajas empiezan en la tráquea, que se divide en dos bronquios principales; estos se ramifican en bronquiolos cada vez más pequeños hasta terminar en los alvéolos, unos sacos diminutos donde ocurre el intercambio de gases.",
            "El bronquio derecho es más corto, ancho y vertical que el izquierdo. Por eso, cuando una persona aspira un objeto, lo más frecuente es que termine en el pulmón derecho.",
          ),
        },
        {
          title: "La respiración: ventilación e intercambio",
          summary: "Cómo entra el aire y cómo pasa el oxígeno a la sangre.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "La ventilación es el movimiento del aire hacia adentro (inspiración) y hacia afuera (espiración). El músculo principal es el diafragma: al contraerse baja, el tórax se agranda y el aire entra. Al relajarse, el aire sale.",
            "En los alvéolos, el oxígeno pasa a la sangre y el dióxido de carbono pasa de la sangre al aire que exhalamos. Este paso ocurre por difusión, de donde hay más concentración hacia donde hay menos.",
            "En la práctica, valoramos la respiración contando las respiraciones en un minuto completo (lo normal en un adulto es de 12 a 20 por minuto), observando si el esfuerzo es normal y midiendo la saturación de oxígeno, que en una persona sana suele estar entre 95 % y 100 %.",
          ),
        },
        {
          title: "Guía de repaso para el examen",
          summary: "Los puntos que debes dominar de las tres unidades.",
          type: "DOCUMENT",
          minutes: 15,
          content: p(
            "Repasa estos puntos antes del examen parcial:",
            "• Los cinco niveles de organización del cuerpo y un ejemplo de cada uno.\n• La posición anatómica y los planos sagital, frontal y transversal.\n• Los términos anterior, posterior, medial, lateral, proximal y distal.\n• Las cuatro cavidades del corazón y el recorrido de la circulación mayor y menor.\n• Valores normales del pulso y la frecuencia respiratoria en el adulto.\n• Por qué los objetos aspirados suelen ir al pulmón derecho.",
            "Consejo: explícale a otra persona, con tus propias palabras, el recorrido de una gota de sangre desde la aurícula derecha hasta volver a ella.",
          ),
        },
      ],
    },
  ],
  assignments: [
    {
      title: "Mapa conceptual de los niveles de organización",
      instructions: p(
        "Elabora un mapa conceptual que muestre los niveles de organización del cuerpo humano (célula, tejido, órgano, sistema y organismo).",
        "Para cada nivel escribe una definición corta y un ejemplo relacionado con el sistema cardiovascular. Puedes hacerlo a mano y escribir aquí la descripción, o pegar el enlace de tu documento.",
      ),
      maxScore: 100,
      answers: [
        "Célula: unidad básica de la vida, por ejemplo el glóbulo rojo. Tejido: grupo de células iguales, como el músculo cardíaco. Órgano: el corazón, formado por músculo, tejido conectivo y nervioso. Sistema: el cardiovascular (corazón, arterias, venas y capilares). Organismo: la persona completa, que necesita que la sangre llegue a todos sus órganos.",
        "Mi mapa empieza en la célula (miocito del corazón), sigue con el tejido muscular cardíaco, el órgano corazón, el sistema cardiovascular y termina en el organismo. Agregué flechas que explican que si falla un nivel se afectan los demás.",
      ],
    },
    {
      title: "Caso clínico: el recorrido de la sangre",
      instructions: p(
        "Doña Carmen, de 68 años, tiene una válvula del lado izquierdo del corazón que no cierra bien.",
        "Explica en un máximo de una página: 1) el recorrido normal de la sangre por la circulación mayor y menor; 2) qué parte de ese recorrido se afecta en su caso; 3) qué signos vitales vigilarías y por qué.",
      ),
      maxScore: 100,
      answers: [
        "La sangre llega por las venas cavas a la aurícula derecha, pasa al ventrículo derecho y va a los pulmones; regresa oxigenada a la aurícula izquierda y sale por la aorta desde el ventrículo izquierdo. En doña Carmen se afecta la salida o el paso de sangre del lado izquierdo, por eso vigilaría pulso, presión arterial, frecuencia respiratoria y saturación.",
        "En su caso la sangre puede devolverse hacia los pulmones. Vigilaría la respiración (si se cansa o tose), la saturación de oxígeno y el pulso, además de la presión arterial dos veces por turno.",
      ],
    },
  ],
  exam: {
    title: "Examen parcial: organización del cuerpo y circulación",
    instructions: "Tienes 30 minutos y dos intentos. Lee cada pregunta con calma; al terminar verás tus respuestas corregidas.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuál es la unidad básica de la vida?", options: ["El tejido", "La célula", "El órgano", "El sistema"], correctIndex: 1, explanation: "Todos los seres vivos están formados por células." },
      { type: "MULTIPLE_CHOICE", prompt: "En la posición anatómica, las palmas de las manos miran hacia…", options: ["Atrás", "Los muslos", "Adelante", "Arriba"], correctIndex: 2, explanation: "La posición anatómica es de pie, mirando al frente, con las palmas hacia adelante." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué plano divide el cuerpo en mitad derecha e izquierda?", options: ["Sagital", "Frontal", "Transversal", "Coronal"], correctIndex: 0, explanation: "El plano sagital separa derecha e izquierda; el frontal o coronal separa adelante y atrás." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué cavidad del corazón impulsa la sangre hacia la aorta?", options: ["Aurícula derecha", "Ventrículo derecho", "Aurícula izquierda", "Ventrículo izquierdo"], correctIndex: 3, explanation: "El ventrículo izquierdo inicia la circulación mayor a través de la aorta." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuál es la frecuencia respiratoria normal de un adulto en reposo?", options: ["6 a 10 por minuto", "12 a 20 por minuto", "25 a 35 por minuto", "40 a 60 por minuto"], correctIndex: 1, explanation: "En el adulto sano en reposo se esperan entre 12 y 20 respiraciones por minuto." },
      { type: "TRUE_FALSE", prompt: "Las arterias son los vasos que llevan la sangre desde el corazón hacia el cuerpo.", answer: "Verdadero", explanation: "Las arterias salen del corazón; las venas llegan a él." },
      { type: "TRUE_FALSE", prompt: "El bronquio izquierdo es más corto y vertical que el derecho.", answer: "Falso", explanation: "Es al revés: el derecho es más corto, ancho y vertical." },
    ],
  },
  liveClass: {
    title: "Repaso en vivo antes del parcial",
    description: "Resolvemos dudas de circulación y respiración. Ten a mano tu guía de repaso.",
    time: "19:00",
    durationMinutes: 60,
    daysFromToday: 2,
    weeks: 1,
  },
};

export const FUNDAMENTOS: DemoCourse = {
  code: "ENF-102",
  name: "Fundamentos de Enfermería",
  description: "El rol del técnico en enfermería, la bioseguridad, los signos vitales y el cuidado básico del paciente.",
  teacher: "rosa",
  program: "ENF",
  maxStudents: 30,
  schedule: [morning(2, "Laboratorio de Enfermería"), morning(4, "Laboratorio de Enfermería")],
  chapters: [
    {
      title: "Unidad 1. La enfermería y el paciente",
      description: "Funciones del técnico, ética y comunicación con el paciente.",
      lessons: [
        {
          title: "El rol del técnico en enfermería",
          summary: "Qué hace, con quién trabaja y cuáles son sus límites.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "El técnico en enfermería forma parte del equipo de salud y trabaja bajo la supervisión de la licenciada o el licenciado en enfermería y del personal médico. Sus tareas principales son el cuidado directo del paciente: higiene, alimentación, movilización, toma de signos vitales, preparación de material y registro de lo observado.",
            "Conocer los límites de tu función es parte de la seguridad del paciente. Si algo está fuera de tus competencias o tienes dudas sobre una indicación, pregunta antes de actuar. Nunca administres un medicamento que no fue indicado por escrito.",
            "La ética guía cada acción: respetar la dignidad y la intimidad del paciente, guardar la confidencialidad de su información y tratar a todos por igual, sin importar su origen, su religión o su situación económica.",
          ),
        },
        {
          title: "Comunicación con el paciente y la familia",
          summary: "Cómo hablar para que el paciente entienda, confíe y colabore.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Preséntate siempre con tu nombre y tu función: «Buenos días, soy Yulissa, técnica de enfermería, y la voy a acompañar esta mañana». Llama al paciente por su nombre, no por el número de cama ni por su diagnóstico.",
            "Explica lo que vas a hacer antes de hacerlo, con palabras sencillas, y verifica que entendió. Escucha con atención: muchas veces el paciente nos dice antes que nadie que algo no anda bien.",
            "Con la familia, sé amable y clara, pero recuerda que los diagnósticos y los resultados los informa el médico. Si te preguntan algo que no te corresponde contestar, dilo con respeto y busca a la persona indicada.",
          ),
        },
        {
          title: "Actividad: juego de roles de comunicación",
          summary: "Practica en tríos una situación difícil con un paciente.",
          type: "ACTIVITY",
          minutes: 25,
          content: p(
            "Formen tríos: una persona es el paciente, otra la técnica de enfermería y la tercera observa.",
            "Situación: don Pedro, de 72 años, no quiere bañarse porque le da vergüenza y dice que «ya está bien así».\n\n1. La técnica se presenta y explica el procedimiento.\n2. Escucha las razones del paciente sin interrumpir.\n3. Ofrece opciones que respeten su intimidad.\n4. El observador anota qué funcionó y qué se puede mejorar.",
            "Cambien de papel hasta que las tres personas hayan sido la técnica.",
          ),
        },
      ],
    },
    {
      title: "Unidad 2. Bioseguridad",
      description: "Higiene de manos y prevención de infecciones.",
      lessons: [
        {
          title: "Los cinco momentos de la higiene de manos",
          summary: "Cuándo lavarse las manos según la Organización Mundial de la Salud.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "La higiene de manos es la medida más sencilla y eficaz para evitar infecciones en los centros de salud. La Organización Mundial de la Salud (OMS) define cinco momentos en los que es obligatoria:",
            "1. Antes de tocar al paciente.\n2. Antes de realizar una tarea limpia o aséptica (por ejemplo, curar una herida).\n3. Después del riesgo de exposición a líquidos corporales.\n4. Después de tocar al paciente.\n5. Después del contacto con el entorno del paciente (cama, mesa, equipos).",
            "Con agua y jabón el lavado dura de 40 a 60 segundos; con solución a base de alcohol, de 20 a 30 segundos. Si las manos están visiblemente sucias, usa siempre agua y jabón. Los guantes no sustituyen la higiene de manos: lávate antes de ponértelos y después de quitártelos.",
          ),
        },
        {
          title: "Video: técnica de higiene de manos",
          summary: "Observa la técnica paso a paso y practícala frente a un espejo hasta que la hagas completa sin mirar el video.",
          type: "VIDEO",
          minutes: 6,
          content: "https://www.youtube.com/watch?v=NMmAj1EKdVo",
        },
        {
          title: "Equipo de protección personal",
          summary: "Qué usar, cuándo y en qué orden.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "El equipo de protección personal (EPP) incluye guantes, bata, mascarilla, protección ocular y gorro. Se elige según el riesgo: no es lo mismo tomar la presión que aspirar secreciones.",
            "Orden recomendado para ponérselo: higiene de manos, bata, mascarilla, protección ocular y, al final, guantes. Para quitárselo: guantes, higiene de manos, protección ocular, bata, mascarilla y otra vez higiene de manos. La idea es quitar primero lo más contaminado y tocar lo menos posible la parte de afuera.",
            "Desecha el material en el recipiente correcto: los objetos punzocortantes van en el envase rígido, nunca en la funda. Y nunca vuelvas a tapar una aguja usada con las dos manos.",
          ),
        },
      ],
    },
    {
      title: "Unidad 3. Signos vitales",
      description: "Temperatura, pulso, respiración, presión arterial y saturación.",
      lessons: [
        {
          title: "Valores normales en el adulto",
          summary: "La tabla que debes saberte de memoria.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Los signos vitales muestran cómo están funcionando el corazón, los pulmones y la regulación de la temperatura. Estos son los rangos de referencia para un adulto en reposo:",
            "• Temperatura: 36.5 a 37.5 °C.\n• Pulso: 60 a 100 latidos por minuto.\n• Respiración: 12 a 20 respiraciones por minuto.\n• Presión arterial: menos de 120/80 mmHg.\n• Saturación de oxígeno: 95 a 100 %.",
            "Un valor fuera de rango no siempre es una emergencia, pero siempre se informa. Compara con las tomas anteriores del mismo paciente: un cambio brusco es tan importante como un valor alto.",
          ),
        },
        {
          title: "Video: cómo medir los signos vitales",
          summary: "Repaso teórico de cada signo vital, sus alteraciones y sus valores normales.",
          type: "VIDEO",
          minutes: 15,
          content: "https://www.youtube.com/watch?v=Tl_U4KbT1Eo",
        },
        {
          title: "Registro en la hoja de enfermería",
          summary: "Cómo anotar para que cualquier colega entienda.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Lo que no se anota, no se hizo. El registro debe ser claro, completo y oportuno: escribe la fecha, la hora, el valor medido, la unidad y tu nombre.",
            "Anota también lo que observaste: «Paciente refiere dolor de cabeza; PA 150/95 mmHg; se informa a la Lcda. Almonte a las 10:15 a. m.». Evita abreviaturas que no estén aprobadas por el centro y no borres: si te equivocas, tacha con una línea, escribe «error» y firma.",
            "Recuerda que la hoja de enfermería es un documento legal. Escribe solo hechos que viste o mediste, no suposiciones.",
          ),
        },
      ],
    },
  ],
  assignments: [
    {
      title: "Registro de signos vitales en casa",
      instructions: p(
        "Toma los signos vitales a dos personas de tu familia (con su permiso) en dos momentos del día: en la mañana y en la noche.",
        "Anota temperatura, pulso, respiración y, si tienes tensiómetro, la presión arterial. Presenta tus datos en una tabla y explica si algún valor está fuera del rango normal y por qué crees que ocurrió.",
      ),
      maxScore: 100,
      answers: [
        "Mi mamá (54 años): mañana T 36.6 °C, pulso 72, respiración 16, PA 118/76. Noche T 36.9 °C, pulso 80, respiración 18, PA 126/82. La presión subió un poco en la noche, ella dice que estaba cansada del trabajo. Mi hermano (19 años): mañana pulso 64, respiración 14; noche pulso 88 porque acababa de jugar baloncesto.",
        "Tomé los signos a mi abuela y a mi tío. A mi abuela le salió la presión 142/88 en la mañana, que está por encima de lo normal; ella toma pastillas para la presión. Los demás valores estuvieron dentro de lo normal.",
      ],
    },
    {
      title: "Guía de bioseguridad para tu área de práctica",
      instructions: p(
        "Prepara una guía de una página para un compañero que empieza sus prácticas.",
        "Incluye: los cinco momentos de la higiene de manos, el orden para ponerse y quitarse el equipo de protección y cómo desechar los objetos punzocortantes. Usa palabras sencillas y, si quieres, dibujos.",
      ),
      maxScore: 100,
      answers: [
        "Guía rápida: 1) Lávate las manos antes y después de tocar al paciente, antes de una tarea limpia, después de tocar líquidos y después de tocar su cama o sus cosas. 2) Ponte bata, mascarilla, lentes y por último guantes. 3) Quítate primero los guantes. 4) Las agujas van al envase rojo rígido, sin taparlas.",
      ],
    },
  ],
  exam: {
    title: "Prueba: bioseguridad y signos vitales",
    instructions: "Tienes 30 minutos y dos intentos. Responde según lo visto en las unidades 2 y 3.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuántos momentos para la higiene de manos define la OMS?", options: ["Tres", "Cuatro", "Cinco", "Siete"], correctIndex: 2, explanation: "La OMS define cinco momentos para la higiene de manos." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuánto debe durar un lavado de manos con agua y jabón?", options: ["5 a 10 segundos", "15 a 20 segundos", "40 a 60 segundos", "3 minutos"], correctIndex: 2, explanation: "El lavado con agua y jabón dura de 40 a 60 segundos." },
      { type: "MULTIPLE_CHOICE", prompt: "Al quitarse el equipo de protección, ¿qué se retira primero?", options: ["La mascarilla", "Los guantes", "La bata", "La protección ocular"], correctIndex: 1, explanation: "Los guantes son lo más contaminado y se retiran primero." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuál es el rango normal del pulso en un adulto en reposo?", options: ["40 a 60 lpm", "60 a 100 lpm", "100 a 140 lpm", "140 a 180 lpm"], correctIndex: 1, explanation: "Entre 60 y 100 latidos por minuto en el adulto en reposo." },
      { type: "MULTIPLE_CHOICE", prompt: "Una saturación de oxígeno normal en una persona sana suele estar entre…", options: ["70 y 80 %", "80 y 90 %", "95 y 100 %", "100 y 110 %"], correctIndex: 2, explanation: "Lo esperado en una persona sana es entre 95 y 100 %." },
      { type: "TRUE_FALSE", prompt: "Usar guantes sustituye la higiene de manos.", answer: "Falso", explanation: "Los guantes no sustituyen la higiene de manos: hay que lavarse antes y después." },
      { type: "TRUE_FALSE", prompt: "Si te equivocas en la hoja de enfermería, debes tachar con una línea, escribir «error» y firmar.", answer: "Verdadero", explanation: "La hoja es un documento legal: no se borra, se corrige dejando constancia." },
    ],
  },
  liveClass: {
    title: "Taller práctico: toma de presión arterial",
    description: "Conéctate con tu tensiómetro si tienes uno. Practicaremos la técnica y el registro.",
    time: "18:30",
    durationMinutes: 90,
    daysFromToday: 4,
    weeks: 2,
  },
};

export const PRIMEROS_AUXILIOS: DemoCourse = {
  code: "ENF-103",
  name: "Primeros Auxilios",
  description: "Qué hacer en los primeros minutos de una emergencia: evaluación, RCP, atragantamiento, hemorragias y quemaduras. Abierto también al público.",
  teacher: "julio",
  program: "ENF",
  maxStudents: 35,
  schedule: [{ weekday: 5, start: 8 * 60, end: 11 * 60, room: "Salón de simulación" }],
  catalogPriceCents: 350000,
  chapters: [
    {
      title: "Unidad 1. Actuar ante una emergencia",
      description: "Protegerse, avisar y socorrer.",
      lessons: [
        {
          title: "La regla PAS: proteger, avisar, socorrer",
          summary: "El orden que evita que haya una segunda víctima.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Ante cualquier emergencia sigue tres pasos en este orden. Proteger: asegúrate de que el lugar es seguro para ti y para la víctima. Si hay tráfico, cables eléctricos, fuego o humo, primero elimina el peligro o espera ayuda. Una persona herida al intentar ayudar es una víctima más.",
            "Avisar: llama al 9-1-1. Di con calma qué pasó, dónde estás (con puntos de referencia), cuántas personas están afectadas y cómo están. No cuelgues hasta que te lo indiquen: el operador puede guiarte.",
            "Socorrer: solo después de proteger y avisar, atiende a la víctima con lo que sabes hacer. No le des agua ni medicamentos y no la muevas si sospechas una lesión en el cuello o la espalda, salvo que su vida corra peligro donde está.",
          ),
        },
        {
          title: "Evaluación inicial de la víctima",
          summary: "¿Responde? ¿Respira? Las dos preguntas que deciden qué hacer.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Acércate y háblale fuerte mientras tocas sus hombros: «¿Me escucha? ¿Está bien?». Si responde, pregúntale qué le pasó, déjala en la posición en que esté más cómoda y vigílala hasta que llegue la ayuda.",
            "Si no responde, pide ayuda en voz alta y revisa si respira: mira si el pecho sube y baja durante no más de 10 segundos. Unas boqueadas aisladas no cuentan como respiración normal.",
            "Si no responde y respira con normalidad, colócala en posición lateral de seguridad. Si no responde y no respira con normalidad, llama al 9-1-1 (o pide que alguien llame) y empieza la reanimación cardiopulmonar de inmediato.",
          ),
        },
        {
          title: "Posición lateral de seguridad",
          summary: "Cómo colocar a una persona inconsciente que respira.",
          type: "TEXT",
          minutes: 8,
          content: p(
            "La posición lateral de seguridad mantiene abierta la vía aérea y evita que la persona se ahogue si vomita. Se usa cuando la víctima está inconsciente pero respira con normalidad y no hay sospecha de lesión en la columna.",
            "Arrodíllate a su lado, coloca el brazo más cercano a ti en ángulo recto, lleva el otro brazo cruzado sobre el pecho con el dorso de la mano contra su mejilla, dobla la rodilla más lejana y gira a la persona hacia ti tirando de esa rodilla.",
            "Inclina un poco la cabeza hacia atrás para que el aire pase bien y revisa su respiración cada minuto hasta que llegue la ayuda.",
          ),
        },
      ],
    },
    {
      title: "Unidad 2. Reanimación cardiopulmonar",
      description: "Compresiones de calidad y uso del desfibrilador.",
      lessons: [
        {
          title: "Compresiones torácicas de calidad",
          summary: "Dónde, qué tan rápido y qué tan profundo.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "En un adulto, coloca el talón de una mano en el centro del pecho, sobre la mitad inferior del esternón, y la otra mano encima con los dedos entrelazados. Mantén los brazos rectos y los hombros justo encima de tus manos.",
            "Comprime fuerte y rápido: de 100 a 120 compresiones por minuto y con una profundidad de 5 a 6 cm. Deja que el pecho vuelva a su posición después de cada compresión y no te detengas más de 10 segundos.",
            "Si tienes entrenamiento, alterna 30 compresiones con 2 ventilaciones. Si no lo tienes o no te sientes capaz, haz solo compresiones continuas hasta que llegue la ayuda o la persona empiece a respirar. Si hay otra persona, túrnense cada dos minutos para no perder calidad.",
          ),
        },
        {
          title: "Video: reanimación cardiopulmonar paso a paso",
          summary: "Mira la secuencia completa. Fíjate en la posición de las manos y en el ritmo de las compresiones.",
          type: "VIDEO",
          minutes: 8,
          content: "https://www.youtube.com/watch?v=WY_P5naFGlo",
        },
        {
          title: "El desfibrilador externo automático (DEA)",
          summary: "Un aparato que cualquiera puede usar siguiendo la voz.",
          type: "TEXT",
          minutes: 8,
          content: p(
            "El DEA analiza el ritmo del corazón y, si hace falta, da una descarga. Está pensado para que lo use cualquier persona: al encenderlo, da instrucciones en voz alta.",
            "Mientras alguien sigue con las compresiones, otra persona enciende el DEA y pega los parches en el pecho desnudo y seco, como muestra el dibujo. Cuando el aparato analiza o va a dar la descarga, nadie debe tocar a la víctima.",
            "Después de la descarga, o si el aparato dice que no está indicada, se reanudan las compresiones de inmediato. Busca dónde hay un DEA en tu trabajo, tu universidad o los centros comerciales que frecuentas.",
          ),
        },
      ],
    },
    {
      title: "Unidad 3. Atragantamiento, hemorragias y quemaduras",
      description: "Las emergencias más frecuentes en la casa y el trabajo.",
      lessons: [
        {
          title: "Atragantamiento en adultos",
          summary: "Cuándo dejar toser y cuándo hacer compresiones abdominales.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Si la persona tose con fuerza, anímala a seguir tosiendo: es la mejor forma de expulsar el objeto. No le des golpes en la espalda mientras tosa bien ni le metas los dedos en la boca a ciegas.",
            "Si no puede toser, hablar ni respirar, se lleva las manos al cuello o se pone morada, actúa: colócate detrás, inclínala hacia adelante y dale hasta cinco golpes firmes entre los omóplatos con el talón de la mano. Si no sale, haz hasta cinco compresiones abdominales (maniobra de Heimlich): puño cerrado sobre el ombligo, la otra mano encima, y tira hacia adentro y hacia arriba.",
            "Alterna cinco golpes y cinco compresiones hasta que salga el objeto. Si la persona pierde el conocimiento, bájala con cuidado al suelo, llama al 9-1-1 y empieza la RCP.",
          ),
        },
        {
          title: "Hemorragias y heridas",
          summary: "Presión directa: la medida que salva vidas.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Ante una hemorragia, ponte guantes si los tienes y presiona directamente la herida con una gasa o un paño limpio. Mantén la presión firme y sin levantarla para «ver cómo va». Si el paño se empapa, pon otro encima sin quitar el primero.",
            "Mantén a la persona acostada y abrigada, y llama al 9-1-1 si el sangrado es abundante o no se detiene. El torniquete se reserva para hemorragias graves en brazos o piernas que no se controlan con presión, y se anota la hora en que se colocó.",
            "En heridas pequeñas, lava con agua limpia y jabón, cubre con una gasa y vigila signos de infección: enrojecimiento, calor, pus o fiebre.",
          ),
        },
        {
          title: "Actividad: ¿qué harías?",
          summary: "Resuelve cuatro situaciones reales en orden de prioridad.",
          type: "ACTIVITY",
          minutes: 20,
          content: p(
            "Para cada situación escribe, en orden, los pasos que seguirías:",
            "1. En la cocina, tu tía se quema la mano con aceite caliente.\n2. Un compañero de trabajo se desploma en el comedor y no responde.\n3. Un niño de 8 años se atraganta con un caramelo y no puede hablar.\n4. Un motorista cae frente al colmado y está consciente, pero se queja de dolor en el cuello.",
            "Pista para la quemadura: enfría con agua a temperatura ambiente entre 10 y 20 minutos; no uses hielo, pasta de dientes ni mantequilla.",
          ),
        },
      ],
    },
  ],
  assignments: [
    {
      title: "Plan de emergencia para tu casa",
      instructions: p(
        "Prepara el plan de emergencia de tu hogar.",
        "Incluye: números de emergencia y de familiares, dirección con puntos de referencia, ubicación del botiquín y lista de lo que debe tener, y qué haría cada miembro de la familia ante un incendio o una persona inconsciente.",
      ),
      maxScore: 100,
      answers: [
        "Números: 9-1-1, mi mamá y mi vecino Ramón. Dirección: calle 5 #12, frente a la iglesia, casa verde de dos niveles. Botiquín en el baño de arriba: gasas, guantes, vendas, alcohol, termómetro y tijera. Si alguien se desmaya: yo reviso si respira y mi hermana llama al 9-1-1.",
        "Hice el plan con mi familia. Pusimos la lista de números en la nevera, revisamos el botiquín y compramos lo que faltaba. Practicamos la posición lateral de seguridad con mi hermano.",
      ],
    },
    {
      title: "Análisis de un caso de RCP",
      instructions: p(
        "Busca una noticia o un video real en el que una persona haya hecho RCP a alguien.",
        "Explica qué pasos de la cadena de supervivencia se cumplieron, qué se hizo bien y qué se pudo mejorar según lo visto en clase. Pega el enlace de la fuente.",
      ),
      maxScore: 100,
      answers: [
        "En el caso que encontré, un salvavidas sacó a un joven del agua, revisó que no respiraba, pidió que llamaran al 9-1-1 y empezó compresiones. Se cumplió el aviso temprano y la RCP inmediata. Se pudo mejorar buscando antes el DEA que había en la caseta.",
      ],
    },
  ],
  exam: {
    title: "Evaluación: emergencias y RCP",
    instructions: "Tienes 30 minutos y dos intentos. Piensa en el orden correcto de los pasos.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuál es el orden correcto ante una emergencia?", options: ["Socorrer, avisar, proteger", "Avisar, socorrer, proteger", "Proteger, avisar, socorrer", "Proteger, socorrer, avisar"], correctIndex: 2, explanation: "Primero la seguridad, luego pedir ayuda y después atender." },
      { type: "MULTIPLE_CHOICE", prompt: "¿A qué ritmo se hacen las compresiones en un adulto?", options: ["60 a 80 por minuto", "80 a 100 por minuto", "100 a 120 por minuto", "130 a 150 por minuto"], correctIndex: 2, explanation: "Se recomiendan de 100 a 120 compresiones por minuto." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué profundidad deben tener las compresiones en un adulto?", options: ["1 a 2 cm", "3 a 4 cm", "5 a 6 cm", "8 a 10 cm"], correctIndex: 2, explanation: "Entre 5 y 6 cm, dejando que el pecho vuelva a su posición." },
      { type: "MULTIPLE_CHOICE", prompt: "Una persona inconsciente que respira con normalidad debe colocarse…", options: ["Boca arriba con las piernas elevadas", "En posición lateral de seguridad", "Sentada", "Boca abajo"], correctIndex: 1, explanation: "La posición lateral de seguridad mantiene abierta la vía aérea." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Cómo se enfría una quemadura?", options: ["Con hielo directo", "Con pasta de dientes", "Con agua a temperatura ambiente de 10 a 20 minutos", "Con mantequilla"], correctIndex: 2, explanation: "Agua a temperatura ambiente; el hielo y los remedios caseros dañan la piel." },
      { type: "TRUE_FALSE", prompt: "Si una persona atragantada tose con fuerza, hay que animarla a seguir tosiendo.", answer: "Verdadero", explanation: "La tos fuerte es la forma más eficaz de expulsar el objeto." },
      { type: "TRUE_FALSE", prompt: "Mientras el DEA da la descarga, una persona debe sujetar a la víctima.", answer: "Falso", explanation: "Nadie debe tocar a la víctima mientras el DEA analiza o descarga." },
    ],
  },
  liveClass: {
    title: "Simulacro de RCP con maniquí",
    description: "Sesión práctica guiada. Si no tienes maniquí, usa un cojín firme sobre el piso.",
    time: "10:00",
    durationMinutes: 120,
    daysFromToday: 8,
    weeks: 1,
  },
};
