import { paragraphs as p, type DemoCourse } from "./types";

/** Curso suelto, abierto al público en el catálogo. */
export const EXCEL: DemoCourse = {
  code: "EXC-100",
  name: "Excel para la Oficina",
  description: "Hojas de cálculo desde cero: fórmulas, funciones, formato, filtros y gráficos para el trabajo diario. Curso corto de los sábados, abierto al público.",
  teacher: "yokasta",
  program: null,
  maxStudents: 25,
  schedule: [{ weekday: 6, start: 9 * 60, end: 12 * 60, room: "Laboratorio de Informática" }],
  catalogPriceCents: 250000,
  chapters: [
    {
      title: "Módulo 1. Primeros pasos",
      description: "La pantalla de Excel, celdas, filas y columnas.",
      lessons: [
        {
          title: "Conoce la hoja de cálculo",
          summary: "Libro, hoja, celda, fila y columna.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Un archivo de Excel se llama libro y puede tener varias hojas, que ves como pestañas en la parte de abajo. Cada hoja es una cuadrícula de columnas (identificadas con letras: A, B, C…) y filas (identificadas con números: 1, 2, 3…).",
            "La intersección de una columna y una fila es una celda, y se nombra con la letra y el número: B4 es la celda de la columna B, fila 4. La celda seleccionada se llama celda activa y su contenido aparece en la barra de fórmulas.",
            "En una celda puedes escribir texto, números, fechas o fórmulas. Acostúmbrate a poner cada dato en su propia celda: así podrás calcular, ordenar y filtrar después.",
          ),
        },
        {
          title: "Video: Excel básico desde cero",
          summary: "Curso en video para principiantes. Mira la primera parte (hasta las fórmulas) y practica en tu computadora al mismo tiempo.",
          type: "VIDEO",
          minutes: 30,
          content: "https://www.youtube.com/watch?v=v_R5SaMTlug",
        },
        {
          title: "Actividad: tu primera tabla",
          summary: "Crea una lista de gastos de la semana.",
          type: "ACTIVITY",
          minutes: 20,
          content: p(
            "Abre un libro nuevo y crea una tabla con estas columnas: Fecha, Concepto, Categoría y Monto.",
            "1. Escribe por lo menos 10 gastos reales o inventados de una semana (pasaje, comida, recarga, etc.).\n2. Pon los títulos en negrita y ajusta el ancho de las columnas.\n3. Da formato de moneda a la columna Monto.\n4. Guarda el archivo con el nombre «Gastos semana 1».",
          ),
        },
      ],
    },
    {
      title: "Módulo 2. Fórmulas y funciones",
      description: "Calcular con Excel: operaciones, SUMA, PROMEDIO y SI.",
      lessons: [
        {
          title: "Fórmulas y referencias",
          summary: "Toda fórmula empieza con el signo igual.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Una fórmula empieza siempre con el signo =. Puedes usar números directamente (=25*4) pero lo útil es usar referencias a celdas: =B2*C2 multiplica lo que haya en B2 por lo que haya en C2, y se actualiza solo cuando cambias esos valores.",
            "Los operadores son: + suma, - resta, * multiplicación, / división y ^ potencia. Excel respeta el orden de las operaciones; usa paréntesis para cambiarlo: =(B2+C2)*0.18.",
            "Cuando copias una fórmula hacia abajo, las referencias cambian solas (B2 pasa a B3). Si necesitas que una referencia no cambie, por ejemplo la celda donde está la tasa del ITBIS, fíjala con el signo de dólar: $F$1. Ese tipo de referencia se llama absoluta.",
          ),
        },
        {
          title: "Funciones esenciales",
          summary: "SUMA, PROMEDIO, MAX, MIN y CONTAR.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Una función es una fórmula que Excel ya trae hecha. Se escribe con su nombre y, entre paréntesis, el rango de celdas: =SUMA(D2:D11) suma de D2 a D11.",
            "Las más usadas en la oficina: SUMA (total), PROMEDIO (media), MAX y MIN (el mayor y el menor), CONTAR (cuántas celdas tienen números) y CONTARA (cuántas celdas no están vacías).",
            "Nota: en las versiones de Excel en español, los argumentos se separan con punto y coma (;) o con coma (,) según la configuración regional de tu computadora. Si una fórmula da error, revisa primero el separador.",
          ),
        },
        {
          title: "La función SI",
          summary: "Que Excel decida por ti según una condición.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "La función SI evalúa una condición y devuelve un valor si se cumple y otro si no se cumple: =SI(condición; valor_si_verdadero; valor_si_falso).",
            "Ejemplo: en una lista de notas, =SI(E2>=70;\"Aprobado\";\"Reprobado\") escribe «Aprobado» cuando la nota de E2 es 70 o más. En una factura, =SI(C2=\"Sí\";B2*0.18;0) calcula el ITBIS solo si el producto lo lleva.",
            "Los textos van entre comillas y los números no. Para condiciones dobles se combinan SI con Y u O: =SI(Y(E2>=70;F2>=80);\"Aprobado\";\"Revisar\") exige nota y asistencia.",
          ),
        },
      ],
    },
    {
      title: "Módulo 3. Organizar y presentar datos",
      description: "Ordenar, filtrar, formato condicional y gráficos.",
      lessons: [
        {
          title: "Ordenar y filtrar",
          summary: "Encontrar rápido lo que buscas en una lista larga.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Para ordenar, selecciona una celda de la columna y usa Datos > Ordenar de A a Z (o de mayor a menor en números). Excel mueve las filas completas para que los datos no se mezclen, siempre que la tabla no tenga filas ni columnas vacías en medio.",
            "El filtro (Datos > Filtro) agrega una flecha a cada título. Desde ahí puedes mostrar solo los gastos de la categoría «Transporte» o solo los clientes de Santiago, sin borrar nada.",
            "Consejo: convierte tu lista en tabla con Ctrl + T. Las tablas se amplían solas al agregar filas, mantienen el formato y ya traen los filtros.",
          ),
        },
        {
          title: "Formato condicional",
          summary: "Colores que avisan solos.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "El formato condicional cambia el color de una celda según su valor. Está en Inicio > Formato condicional.",
            "Usos prácticos: marcar en rojo las facturas vencidas, en verde las notas aprobadas o resaltar los gastos mayores de RD$5,000. También puedes usar barras de datos para ver de un vistazo qué montos son más grandes.",
            "No abuses de los colores: elige uno o dos que tengan un significado claro y explícalo en una nota al lado de la tabla.",
          ),
        },
        {
          title: "Gráficos que se entienden",
          summary: "Elegir el gráfico correcto para cada mensaje.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Selecciona los datos (con sus títulos) y ve a Insertar > Gráficos. Excel sugiere opciones, pero tú decides según lo que quieres mostrar.",
            "Columnas o barras: para comparar categorías, como gastos por mes. Líneas: para ver cómo cambia algo en el tiempo, como las ventas de cada semana. Circular: solo para mostrar partes de un total, y con pocas categorías.",
            "Un buen gráfico tiene un título que dice la conclusión («Las ventas subieron 20 % en diciembre»), ejes con unidades y nada que distraiga, como efectos en 3D o demasiados colores.",
          ),
        },
      ],
    },
  ],
  assignments: [
    {
      title: "Presupuesto mensual con fórmulas",
      instructions: p(
        "Crea un presupuesto mensual con tus ingresos y por lo menos 12 gastos agrupados en categorías.",
        "Usa SUMA para los totales por categoría, una fórmula para el balance (ingresos menos gastos) y SI para que aparezca «Ahorro» o «Déficit» según el resultado. Comparte el enlace de tu archivo (OneDrive o Google Drive) o describe tus fórmulas aquí.",
      ),
      maxScore: 100,
      answers: [
        "Hice el presupuesto en Google Sheets. Ingresos RD$32,000. Gastos en 4 categorías: vivienda, transporte, comida y otros, con =SUMA() en cada una. Balance =B3-B20 y en C20 =SI(C19>=0;\"Ahorro\";\"Déficit\"). Me salió ahorro de RD$2,300.",
        "Mi presupuesto tiene 14 gastos. Usé SUMA por categoría, el balance con una resta y la función SI. También puse formato condicional para que el déficit salga en rojo.",
      ],
    },
    {
      title: "Reporte de ventas con gráfico",
      instructions: p(
        "Con los datos de ventas de seis meses de un negocio (reales o inventados), crea una tabla con el total por mes.",
        "Agrega un gráfico de columnas con un título que diga la conclusión principal y aplica formato condicional para resaltar el mejor mes.",
      ),
      maxScore: 100,
      answers: [
        "Tabla de ventas de abril a septiembre de una repostería. Gráfico de columnas con el título «Septiembre fue el mejor mes por las fiestas patronales». El mejor mes sale en verde con formato condicional.",
      ],
    },
  ],
  exam: {
    title: "Prueba final de Excel",
    instructions: "Tienes 30 minutos y dos intentos. Si tienes Excel a mano, puedes probar las fórmulas.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Con qué signo empieza toda fórmula en Excel?", options: ["+", "=", "#", "$"], correctIndex: 1, explanation: "Toda fórmula empieza con el signo igual." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué nombre tiene la celda de la columna C y la fila 7?", options: ["7C", "C7", "C:7", "F3"], correctIndex: 1, explanation: "Primero la letra de la columna y después el número de la fila." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué función calcula el promedio de B2 a B10?", options: ["=SUMA(B2:B10)", "=MEDIA(B2;B10)", "=PROMEDIO(B2:B10)", "=CONTAR(B2:B10)"], correctIndex: 2, explanation: "PROMEDIO devuelve la media del rango." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuál es una referencia absoluta?", options: ["F1", "$F$1", "F$", "#F1"], correctIndex: 1, explanation: "El signo de dólar fija la columna y la fila al copiar la fórmula." },
      { type: "MULTIPLE_CHOICE", prompt: "Para mostrar cómo cambian las ventas semana a semana, el mejor gráfico es…", options: ["Circular", "De líneas", "De anillos", "Ninguno"], correctIndex: 1, explanation: "Las líneas muestran cambios en el tiempo." },
      { type: "TRUE_FALSE", prompt: "En la función SI, los textos que se devuelven van entre comillas.", answer: "Verdadero", explanation: "Los textos van entre comillas; los números no." },
      { type: "TRUE_FALSE", prompt: "Filtrar una lista borra las filas que no se muestran.", answer: "Falso", explanation: "El filtro solo las oculta; al quitarlo vuelven a aparecer." },
    ],
  },
  liveClass: {
    title: "Laboratorio en vivo: tablas y gráficos",
    description: "Trabajaremos juntos el reporte de ventas. Ten Excel o Google Sheets abierto.",
    time: "09:00",
    durationMinutes: 120,
    daysFromToday: 5,
    weeks: 2,
  },
};
