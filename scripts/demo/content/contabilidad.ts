import { paragraphs as p, type DemoCourse } from "./types";

/** Cursos del programa «Técnico en Contabilidad» (tanda de la noche). */

const night = (weekday: number, room: string) => ({ weekday, start: 18 * 60, end: 20 * 60, room });

export const CONTABILIDAD_BASICA: DemoCourse = {
  code: "CON-101",
  name: "Contabilidad Básica",
  description: "La ecuación contable, las cuentas, la partida doble y los primeros estados financieros de un negocio.",
  teacher: "ramon",
  program: "CON",
  maxStudents: 30,
  schedule: [night(1, "Aula 204"), night(3, "Aula 204")],
  chapters: [
    {
      title: "Unidad 1. ¿Qué es la contabilidad?",
      description: "Para qué sirve y quién la usa.",
      lessons: [
        {
          title: "La contabilidad en un negocio real",
          summary: "Del cuaderno del colmado a los estados financieros.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "La contabilidad es el sistema que registra, clasifica y resume lo que pasa con el dinero y los bienes de un negocio. Doña Fefa, que anota en un cuaderno lo que fía en su colmado, ya hace una forma sencilla de contabilidad.",
            "La información contable la usan muchas personas: el dueño, para saber si gana o pierde; el banco, antes de darle un préstamo; la Dirección General de Impuestos Internos (DGII), para calcular los impuestos; y los empleados, que quieren saber si la empresa es estable.",
            "Un buen registro contable es ordenado, está respaldado por documentos (facturas, recibos, comprobantes fiscales) y se hace a tiempo. Lo que no tiene soporte no se puede registrar.",
          ),
        },
        {
          title: "La ecuación contable",
          summary: "Activo = Pasivo + Capital: la base de todo.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "Todo lo que tiene un negocio (activo) se financió con dinero de terceros (pasivo) o con dinero de los dueños (capital). Por eso siempre se cumple: Activo = Pasivo + Capital.",
            "Ejemplo: Luis abre una barbería con RD$150,000 de sus ahorros y un préstamo de RD$100,000. Compra sillas, máquinas y productos por RD$180,000 y le quedan RD$70,000 en el banco. Su activo es RD$250,000 (180,000 + 70,000); su pasivo, RD$100,000 (el préstamo); y su capital, RD$150,000. La ecuación cuadra: 250,000 = 100,000 + 150,000.",
            "Cada operación cambia al menos dos partidas, pero la igualdad nunca se rompe. Si algún día no cuadra, hay un error de registro.",
          ),
        },
        {
          title: "Actividad: clasifica las cuentas",
          summary: "¿Activo, pasivo o capital?",
          type: "ACTIVITY",
          minutes: 15,
          content: p(
            "Clasifica cada partida como activo, pasivo o capital:",
            "1. Dinero en la caja chica.\n2. Préstamo con el Banco Popular.\n3. Mercancía en el almacén.\n4. Aporte inicial de la dueña.\n5. Factura pendiente de pago a un suplidor.\n6. Camioneta de reparto.\n7. Cuentas por cobrar a clientes.",
            "Luego calcula el capital de un negocio que tiene RD$320,000 en activos y RD$85,000 en pasivos.",
          ),
        },
      ],
    },
    {
      title: "Unidad 2. Cuentas y partida doble",
      description: "Debe, haber y el libro diario.",
      lessons: [
        {
          title: "La cuenta: debe y haber",
          summary: "Cómo aumentan y disminuyen las cuentas.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Una cuenta es el registro de los movimientos de una partida, como Caja o Banco. Se representa con una «T»: a la izquierda va el debe y a la derecha el haber.",
            "Las cuentas de activo aumentan por el debe y disminuyen por el haber. Las de pasivo y capital funcionan al revés: aumentan por el haber y disminuyen por el debe. Los ingresos aumentan por el haber y los gastos por el debe.",
            "El saldo de una cuenta es la diferencia entre lo que suma el debe y lo que suma el haber. Una cuenta de Caja con debe de RD$45,000 y haber de RD$30,000 tiene un saldo deudor de RD$15,000.",
          ),
        },
        {
          title: "Video: la partida doble explicada",
          summary: "Mira el video y escribe dos ejemplos propios de operaciones con sus cuentas de debe y de haber.",
          type: "VIDEO",
          minutes: 12,
          content: "https://www.youtube.com/watch?v=48UpzAFRQWw",
        },
        {
          title: "El libro diario",
          summary: "Registrar cada operación en orden de fecha.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "El libro diario registra todas las operaciones en orden cronológico. Cada asiento lleva fecha, las cuentas que se cargan (debe), las que se abonan (haber), los montos y una breve explicación.",
            "Ejemplo: el 3 de octubre la barbería vende servicios al contado por RD$8,500. Asiento: Debe — Caja RD$8,500; Haber — Ingresos por servicios RD$8,500. Explicación: «Ventas del día según cuadre de caja».",
            "Regla de oro de la partida doble: en cada asiento, la suma del debe es igual a la suma del haber. Si no son iguales, el asiento está mal.",
          ),
        },
      ],
    },
    {
      title: "Unidad 3. Del mayor a los estados financieros",
      description: "Balanza de comprobación, estado de resultados y balance general.",
      lessons: [
        {
          title: "Mayor y balanza de comprobación",
          summary: "Ordenar por cuenta y comprobar que todo cuadre.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Del libro diario se pasan los movimientos al libro mayor, donde cada cuenta tiene su propia «T». Así se ve de un vistazo cuánto entró y salió de Caja, de Banco o de Cuentas por pagar.",
            "La balanza de comprobación lista todas las cuentas con sus saldos deudores y acreedores. La suma de los saldos deudores debe ser igual a la suma de los acreedores.",
            "Que la balanza cuadre no garantiza que no haya errores (por ejemplo, un asiento registrado dos veces), pero sí detecta los descuadres más comunes.",
          ),
        },
        {
          title: "Estado de resultados",
          summary: "¿El negocio ganó o perdió en el período?",
          type: "TEXT",
          minutes: 12,
          content: p(
            "El estado de resultados resume los ingresos y los gastos de un período, por ejemplo un mes o un año. Ingresos menos costos y gastos da la utilidad (si es positiva) o la pérdida (si es negativa).",
            "Estructura sencilla: ventas, menos costo de ventas, igual a utilidad bruta; menos gastos de operación (salarios, alquiler, luz), igual a utilidad de operación; menos impuestos, igual a utilidad neta.",
            "Un negocio puede tener mucho dinero en caja y aun así estar perdiendo, o ganar dinero y no tener efectivo porque sus clientes no le han pagado. Por eso se revisa junto con el balance general.",
          ),
        },
        {
          title: "Balance general",
          summary: "La foto de lo que tiene y lo que debe el negocio en una fecha.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "El balance general (o estado de situación financiera) muestra en una fecha determinada los activos, los pasivos y el capital. Es la ecuación contable presentada de forma ordenada.",
            "Los activos se ordenan de más líquidos a menos líquidos: efectivo, cuentas por cobrar, inventario y, después, mobiliario, equipos y vehículos. Los pasivos se ordenan según cuándo vencen: primero los de corto plazo.",
            "La utilidad del estado de resultados se suma al capital. Así se conectan los dos estados: lo que el negocio ganó en el período aumenta lo que les pertenece a sus dueños.",
          ),
          draft: true,
        },
      ],
    },
  ],
  assignments: [
    {
      title: "Ecuación contable de un negocio del barrio",
      instructions: p(
        "Elige un negocio de tu barrio (colmado, salón, taller) e imagina sus cifras de forma realista.",
        "Haz una lista de por lo menos cinco activos, dos pasivos y el capital, con montos en pesos, y demuestra que se cumple la ecuación contable.",
      ),
      maxScore: 100,
      answers: [
        "Negocio: taller de motores. Activos: caja RD$12,000, herramientas RD$95,000, repuestos RD$40,000, cuentas por cobrar RD$18,000, compresor RD$35,000 = RD$200,000. Pasivos: préstamo cooperativa RD$60,000, suplidor RD$15,000 = RD$75,000. Capital = RD$125,000. 200,000 = 75,000 + 125,000.",
        "Elegí el salón de mi tía. Activos RD$310,000 (sillas, secadores, productos, banco). Pasivos RD$90,000 (tarjeta y suplidor). Capital RD$220,000. La ecuación cuadra.",
      ],
    },
    {
      title: "Libro diario de una semana",
      instructions: p(
        "Registra en el libro diario las siguientes operaciones de la barbería de Luis:",
        "1) Compra de productos a crédito por RD$12,000. 2) Ventas al contado por RD$9,800. 3) Pago de alquiler por RD$15,000 con transferencia. 4) Pago parcial al suplidor por RD$6,000. Verifica que cada asiento cuadre.",
      ),
      maxScore: 100,
      answers: [
        "1) Debe Inventario 12,000 / Haber Cuentas por pagar 12,000. 2) Debe Caja 9,800 / Haber Ingresos 9,800. 3) Debe Gasto de alquiler 15,000 / Haber Banco 15,000. 4) Debe Cuentas por pagar 6,000 / Haber Banco 6,000.",
      ],
    },
  ],
  exam: {
    title: "Parcial: ecuación contable y partida doble",
    instructions: "Tienes 30 minutos y dos intentos. Puedes usar calculadora.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuál es la ecuación contable?", options: ["Activo = Pasivo − Capital", "Activo = Pasivo + Capital", "Capital = Activo + Pasivo", "Pasivo = Activo + Capital"], correctIndex: 1, explanation: "Todo lo que tiene el negocio se financia con deudas o con aportes de los dueños." },
      { type: "MULTIPLE_CHOICE", prompt: "Un negocio tiene RD$320,000 de activos y RD$85,000 de pasivos. ¿Cuál es su capital?", options: ["RD$235,000", "RD$405,000", "RD$85,000", "RD$320,000"], correctIndex: 0, explanation: "Capital = 320,000 − 85,000 = 235,000." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Por dónde aumentan las cuentas de activo?", options: ["Por el haber", "Por el debe", "Por el saldo", "No aumentan"], correctIndex: 1, explanation: "Los activos aumentan por el debe y disminuyen por el haber." },
      { type: "MULTIPLE_CHOICE", prompt: "Una venta al contado de RD$8,500 se registra así:", options: ["Debe Ingresos / Haber Caja", "Debe Caja / Haber Ingresos", "Debe Cuentas por pagar / Haber Caja", "Debe Capital / Haber Caja"], correctIndex: 1, explanation: "Entra dinero a Caja (debe) y se reconoce el ingreso (haber)." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué estado financiero muestra si el negocio ganó o perdió en un período?", options: ["Balance general", "Balanza de comprobación", "Estado de resultados", "Libro mayor"], correctIndex: 2, explanation: "El estado de resultados compara ingresos con costos y gastos." },
      { type: "TRUE_FALSE", prompt: "En cada asiento la suma del debe debe ser igual a la suma del haber.", answer: "Verdadero", explanation: "Esa es la regla de la partida doble." },
      { type: "TRUE_FALSE", prompt: "Un préstamo bancario es una cuenta de capital.", answer: "Falso", explanation: "Es un pasivo: una deuda con un tercero." },
    ],
  },
  liveClass: {
    title: "Taller: asientos de diario con casos reales",
    description: "Traigan facturas o recibos de un negocio conocido; los registraremos juntos.",
    time: "19:30",
    durationMinutes: 60,
    daysFromToday: 1,
    weeks: 2,
  },
};

export const MATEMATICA_FINANCIERA: DemoCourse = {
  code: "CON-102",
  name: "Matemática Financiera",
  description: "Porcentajes, interés simple y compuesto, descuentos y cuotas de préstamos aplicados a la vida diaria y al negocio.",
  teacher: "yokasta",
  program: "CON",
  maxStudents: 30,
  schedule: [night(2, "Aula 204"), night(4, "Aula 204")],
  chapters: [
    {
      title: "Unidad 1. Porcentajes en la vida diaria",
      description: "Aumentos, descuentos e impuestos.",
      lessons: [
        {
          title: "Calcular porcentajes sin miedo",
          summary: "Tres formas de calcular un porcentaje con o sin calculadora.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Un porcentaje es una parte de cada cien. El 18 % de algo es 18 de cada 100, es decir, 0.18. Para calcular un porcentaje, multiplica el monto por el porcentaje escrito en decimal: el 18 % de RD$2,500 es 2,500 × 0.18 = RD$450.",
            "Truco mental: el 10 % se obtiene moviendo el punto decimal un lugar a la izquierda (10 % de 2,500 = 250). Con eso calculas fácilmente el 5 % (la mitad: 125) o el 20 % (el doble: 500).",
            "Para saber qué porcentaje representa una cantidad de otra, divide la parte entre el total y multiplica por 100: si de 40 estudiantes aprobaron 34, el porcentaje es 34 ÷ 40 × 100 = 85 %.",
          ),
        },
        {
          title: "Aumentos y descuentos sucesivos",
          summary: "Por qué un 10 % más un 10 % no es un 20 %.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "Para aumentar un precio en un porcentaje, multiplica por (1 + porcentaje). Un producto de RD$1,200 que sube 15 % pasa a costar 1,200 × 1.15 = RD$1,380. Para un descuento, multiplica por (1 − porcentaje): con 25 % de descuento, 1,200 × 0.75 = RD$900.",
            "Cuidado con los porcentajes sucesivos: si un precio sube 10 % y luego baja 10 %, no vuelve al original. RD$1,000 × 1.10 = 1,100; 1,100 × 0.90 = RD$990.",
            "Lo mismo pasa con dos descuentos seguidos: un 20 % y luego otro 10 % equivalen a 1 − (0.80 × 0.90) = 28 %, no a 30 %.",
          ),
        },
        {
          title: "Actividad: el carrito del supermercado",
          summary: "Calcula precios con descuentos e impuestos.",
          type: "ACTIVITY",
          minutes: 20,
          content: p(
            "Resuelve con procedimiento:",
            "1. Una licuadora cuesta RD$3,950 antes de impuestos. ¿Cuánto pagas con el 18 % de ITBIS?\n2. Una tienda ofrece 30 % de descuento en una estufa de RD$24,500. ¿Cuánto ahorras y cuánto pagas?\n3. El pasaje subió de RD$35 a RD$45. ¿En qué porcentaje aumentó?\n4. Inventa un problema con dos descuentos seguidos y resuélvelo.",
          ),
        },
      ],
    },
    {
      title: "Unidad 2. Interés simple y compuesto",
      description: "El valor del dinero en el tiempo.",
      lessons: [
        {
          title: "Interés simple",
          summary: "I = C × i × t, paso a paso.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "El interés es el precio de usar dinero ajeno. En el interés simple se calcula siempre sobre el capital inicial: I = C × i × t, donde C es el capital, i la tasa por período y t el número de períodos.",
            "Ejemplo: le prestas RD$20,000 a un familiar al 2 % mensual durante 6 meses. I = 20,000 × 0.02 × 6 = RD$2,400. Al final te devuelve RD$22,400.",
            "Las unidades de la tasa y del tiempo deben coincidir. Si la tasa es anual y el plazo está en meses, convierte uno de los dos: 24 % anual equivale a 2 % mensual en interés simple.",
          ),
        },
        {
          title: "Video: interés simple y compuesto",
          summary: "Compara los dos tipos de interés con ejemplos. Anota la fórmula de cada uno y en qué se diferencian.",
          type: "VIDEO",
          minutes: 14,
          content: "https://www.youtube.com/watch?v=MZOQSKL_xHk",
        },
        {
          title: "Interés compuesto",
          summary: "Cuando los intereses también generan intereses.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "En el interés compuesto, al final de cada período los intereses se suman al capital y el siguiente cálculo se hace sobre el nuevo total. La fórmula del monto final es M = C × (1 + i)ⁿ.",
            "Ejemplo: ahorras RD$50,000 en un certificado al 8 % anual capitalizable cada año durante 3 años. M = 50,000 × 1.08³ = 50,000 × 1.259712 = RD$62,985.60. Con interés simple habrías obtenido RD$62,000.",
            "El interés compuesto trabaja a tu favor cuando ahorras y en tu contra cuando debes, por ejemplo en una tarjeta de crédito que no pagas completa cada mes.",
          ),
        },
      ],
    },
    {
      title: "Unidad 3. Préstamos y cuotas",
      description: "Cómo se calcula una cuota y cuánto cuesta realmente un préstamo.",
      lessons: [
        {
          title: "La cuota fija de un préstamo",
          summary: "Qué parte de la cuota es interés y qué parte es capital.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "La mayoría de los préstamos personales se pagan con una cuota fija mensual. Cada cuota tiene dos partes: el interés del mes (sobre lo que todavía debes) y el abono al capital.",
            "Al principio la mayor parte de la cuota es interés; con el tiempo, como la deuda baja, el interés se reduce y el abono al capital crece. Esto se ve en la tabla de amortización que entrega el banco o la cooperativa.",
            "Antes de firmar, compara la tasa anual, los cargos (seguro, comisiones) y el total que pagarás al final. Un préstamo de RD$100,000 con cuotas de RD$9,300 durante 12 meses termina costando RD$111,600.",
          ),
        },
        {
          title: "Actividad: compara dos ofertas",
          summary: "Decide qué préstamo conviene más.",
          type: "ACTIVITY",
          minutes: 20,
          content: p(
            "Un estudiante necesita RD$60,000 para comprar una computadora y recibe dos ofertas:",
            "A) Cooperativa: 12 cuotas de RD$5,550.\nB) Tienda: 18 cuotas de RD$4,100.",
            "1. Calcula el total pagado en cada opción.\n2. ¿Cuánto paga de intereses en cada una?\n3. ¿Cuál recomendarías y por qué? Considera también cuánto puede pagar cada mes.",
          ),
        },
        {
          title: "Presupuesto personal",
          summary: "Ingresos, gastos fijos, gastos variables y ahorro.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Un presupuesto compara lo que entra con lo que sale cada mes. Empieza anotando tus ingresos y luego los gastos fijos (alquiler, transporte, internet, cuotas) y los variables (comida, salidas).",
            "Una guía útil es separar desde el principio una parte para el ahorro, aunque sea pequeña, en lugar de ahorrar «lo que sobre». Un fondo de emergencia de tres meses de gastos te protege ante imprevistos.",
            "Revisa el presupuesto cada mes y ajústalo. Si tus cuotas de deudas pasan de un tercio de tus ingresos, es momento de no tomar más préstamos.",
          ),
        },
      ],
    },
  ],
  assignments: [
    {
      title: "Problemas de porcentajes y descuentos",
      instructions: p(
        "Resuelve los cuatro problemas de la actividad «El carrito del supermercado» con todo el procedimiento.",
        "Además, busca un anuncio real con descuento (puede ser de una tienda en línea) y comprueba si el porcentaje anunciado es correcto.",
      ),
      maxScore: 100,
      answers: [
        "1) 3,950 × 1.18 = RD$4,661. 2) Ahorro 24,500 × 0.30 = RD$7,350; pago RD$17,150. 3) (45 − 35) ÷ 35 × 100 = 28.57 %. 4) Camisa de RD$1,000 con 20 % y luego 10 %: 1,000 × 0.8 × 0.9 = RD$720, descuento total 28 %.",
        "Hice los cuatro problemas. En el anuncio que encontré decía 40 % de descuento en unos tenis de RD$5,000 a RD$3,200, pero en realidad es 36 %.",
      ],
    },
    {
      title: "Tabla de ahorro con interés compuesto",
      instructions: p(
        "Imagina que ahorras RD$30,000 al 7 % anual durante 5 años.",
        "Construye una tabla año por año con el saldo usando interés compuesto y compárala con el resultado usando interés simple. Explica la diferencia en dos o tres oraciones.",
      ),
      maxScore: 100,
      answers: [
        "Año 1: 32,100. Año 2: 34,347. Año 3: 36,751.29. Año 4: 39,323.88. Año 5: 42,076.55. Con interés simple serían 30,000 + 30,000 × 0.07 × 5 = 40,500. La diferencia (RD$1,576.55) son los intereses que ganaron los intereses.",
      ],
    },
  ],
  exam: {
    title: "Parcial: porcentajes e interés",
    instructions: "Tienes 30 minutos y dos intentos. Usa calculadora y redondea a dos decimales.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuánto es el 18 % de RD$2,500?", options: ["RD$180", "RD$450", "RD$418", "RD$2,950"], correctIndex: 1, explanation: "2,500 × 0.18 = 450." },
      { type: "MULTIPLE_CHOICE", prompt: "Un artículo de RD$1,200 tiene 25 % de descuento. ¿Cuánto se paga?", options: ["RD$300", "RD$900", "RD$1,175", "RD$1,500"], correctIndex: 1, explanation: "1,200 × 0.75 = 900." },
      { type: "MULTIPLE_CHOICE", prompt: "Interés simple de RD$20,000 al 2 % mensual durante 6 meses:", options: ["RD$240", "RD$1,200", "RD$2,400", "RD$4,000"], correctIndex: 2, explanation: "20,000 × 0.02 × 6 = 2,400." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuál es la fórmula del monto con interés compuesto?", options: ["M = C × i × t", "M = C + i + n", "M = C × (1 + i)ⁿ", "M = C ÷ (1 + i)"], correctIndex: 2, explanation: "En el compuesto, el capital crece multiplicándose por (1 + i) cada período." },
      { type: "MULTIPLE_CHOICE", prompt: "Un precio sube 10 % y luego baja 10 %. Comparado con el original, queda…", options: ["Igual", "1 % más bajo", "1 % más alto", "10 % más bajo"], correctIndex: 1, explanation: "1.10 × 0.90 = 0.99: queda 1 % por debajo." },
      { type: "TRUE_FALSE", prompt: "En el interés simple, los intereses se calculan siempre sobre el capital inicial.", answer: "Verdadero", explanation: "Esa es la diferencia con el interés compuesto." },
      { type: "TRUE_FALSE", prompt: "En una cuota fija, la parte de interés aumenta con cada pago.", answer: "Falso", explanation: "El interés baja porque la deuda pendiente se reduce." },
    ],
  },
  liveClass: {
    title: "Clínica de problemas de interés compuesto",
    description: "Resolvemos en vivo los ejercicios que más dudas generaron.",
    time: "20:15",
    durationMinutes: 45,
    daysFromToday: 3,
    weeks: 1,
  },
};

export const LEGISLACION_TRIBUTARIA: DemoCourse = {
  code: "CON-103",
  name: "Legislación Tributaria Dominicana",
  description: "Los impuestos que más usa un técnico contable en la República Dominicana: RNC, comprobantes fiscales, ITBIS e impuesto sobre la renta.",
  teacher: "ramon",
  program: "CON",
  maxStudents: 30,
  schedule: [night(5, "Aula 205")],
  chapters: [
    {
      title: "Unidad 1. El sistema tributario",
      description: "La DGII, el RNC y las obligaciones básicas.",
      lessons: [
        {
          title: "La DGII y el Registro Nacional de Contribuyentes",
          summary: "Quién administra los impuestos y cómo se identifica cada contribuyente.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "En la República Dominicana, la Dirección General de Impuestos Internos (DGII) administra los impuestos internos, como el ITBIS y el impuesto sobre la renta. La Dirección General de Aduanas (DGA) se encarga de los impuestos de importación.",
            "Toda persona o empresa que realiza actividades económicas debe inscribirse en el Registro Nacional de Contribuyentes (RNC). Las personas físicas usan su número de cédula como identificación tributaria; las empresas reciben un número de RNC.",
            "Estar al día con la DGII es requisito para muchas gestiones: participar en compras del Estado, pedir un préstamo o vender a otras empresas que necesitan comprobantes fiscales válidos.",
          ),
        },
        {
          title: "Comprobantes fiscales (NCF y e-CF)",
          summary: "Por qué cada venta debe tener su comprobante.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "El Número de Comprobante Fiscal (NCF) es la numeración que autoriza la DGII para las facturas. Permite saber quién vendió, a quién y por cuánto, y es lo que da derecho al comprador a usar el ITBIS pagado como crédito o a registrar el gasto.",
            "Hay distintos tipos: factura de crédito fiscal (cuando el cliente es una empresa o una persona que la necesita para sus impuestos), factura de consumo (cliente final), notas de crédito y de débito, y comprobantes para gastos menores o regímenes especiales, entre otros.",
            "El país avanza hacia la facturación electrónica (e-CF), en la que cada comprobante se envía a la DGII en el momento de emitirse. Como técnico contable, verificarás que los comprobantes de compras sean válidos antes de registrarlos.",
          ),
        },
        {
          title: "Calendario de obligaciones",
          summary: "Las fechas que no se pueden olvidar cada mes.",
          type: "DOCUMENT",
          minutes: 10,
          content: p(
            "Cada empresa tiene un calendario fiscal. Estas son las obligaciones mensuales más comunes para un negocio que cobra ITBIS y tiene empleados:",
            "• Envío de los formatos de compras (606) y de ventas (607) del mes anterior.\n• Declaración y pago del ITBIS del mes anterior (formulario IT-1).\n• Declaración y pago de las retenciones a empleados y terceros (IR-3 e IR-17).\n• Pago de los aportes a la Tesorería de la Seguridad Social (TSS).",
            "Las fechas exactas pueden cambiar cuando caen en fin de semana o feriado: consulta siempre el calendario vigente en el portal de la DGII. Presentar tarde genera recargos e intereses aunque no haya impuesto a pagar.",
          ),
        },
      ],
    },
    {
      title: "Unidad 2. El ITBIS",
      description: "El impuesto a la transferencia de bienes y servicios.",
      lessons: [
        {
          title: "Qué es el ITBIS y cómo se calcula",
          summary: "Tasa general, ITBIS cobrado y ITBIS pagado.",
          type: "TEXT",
          minutes: 15,
          content: p(
            "El Impuesto sobre la Transferencia de Bienes Industrializados y Servicios (ITBIS) grava la venta de la mayoría de los bienes y servicios. La tasa general es del 18 %; algunos bienes tienen una tasa reducida y otros están exentos, como muchos alimentos de la canasta básica.",
            "El negocio cobra ITBIS en sus ventas (ITBIS facturado) y paga ITBIS en sus compras (ITBIS adelantado). Cada mes declara la diferencia: ITBIS a pagar = ITBIS facturado − ITBIS adelantado que tenga derecho a deducir.",
            "Ejemplo: en el mes una ferretería vendió RD$500,000 más ITBIS (facturó RD$90,000 de ITBIS) y compró mercancía por RD$300,000 más ITBIS (pagó RD$54,000). Si las compras tienen comprobante válido, el ITBIS a pagar es 90,000 − 54,000 = RD$36,000.",
          ),
        },
        {
          title: "Video: todo sobre el ITBIS",
          summary: "Cápsula explicativa sobre el ITBIS. Anota qué operaciones están exentas y qué se necesita para deducir el ITBIS de las compras.",
          type: "VIDEO",
          minutes: 8,
          content: "https://www.youtube.com/watch?v=4LOZNoMIGd8",
        },
        {
          title: "Actividad: declara el ITBIS del mes",
          summary: "Calcula el ITBIS a pagar de un negocio con datos reales.",
          type: "ACTIVITY",
          minutes: 25,
          content: p(
            "La papelería «El Estudiante» tuvo estos movimientos en septiembre (montos sin ITBIS):",
            "• Ventas con factura de consumo: RD$185,000.\n• Ventas con factura de crédito fiscal: RD$95,000.\n• Compras de mercancía con NCF válido: RD$160,000.\n• Pago de luz con NCF válido: RD$12,000.\n• Compra a un suplidor que no entregó comprobante: RD$8,000.",
            "1. Calcula el ITBIS facturado.\n2. Calcula el ITBIS adelantado deducible (¿cuál compra no puedes deducir?).\n3. Calcula el ITBIS a pagar en la declaración.",
          ),
        },
      ],
    },
    {
      title: "Unidad 3. Impuesto sobre la renta",
      description: "Personas físicas, empresas y retenciones.",
      lessons: [
        {
          title: "Impuesto sobre la renta: ideas básicas",
          summary: "Quién lo paga y sobre qué.",
          type: "TEXT",
          minutes: 12,
          content: p(
            "El impuesto sobre la renta (ISR) grava las ganancias. Las empresas lo calculan sobre su renta neta imponible del año (ingresos menos los gastos que la ley permite deducir) y presentan una declaración anual.",
            "Las personas físicas asalariadas normalmente no declaran: su empleador les retiene el impuesto cada mes según la escala vigente y lo paga a la DGII. Quienes tienen otros ingresos, como un negocio propio o alquileres, presentan su declaración anual.",
            "La escala, las tasas y los montos exentos se actualizan; antes de cualquier cálculo real, confirma los valores vigentes publicados por la DGII.",
          ),
        },
        {
          title: "Retenciones",
          summary: "Cuando quien paga se encarga de cobrar el impuesto.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Una retención ocurre cuando quien paga descuenta una parte del pago y la entrega directamente a la DGII a nombre de quien cobra. Es una forma de asegurar el cobro del impuesto.",
            "Ejemplos frecuentes: el impuesto sobre la renta de los salarios, el porcentaje que se retiene a los profesionales independientes por sus honorarios y algunas retenciones de ITBIS cuando una empresa contrata ciertos servicios a personas físicas.",
            "Quien retiene es responsable de declarar y pagar lo retenido a tiempo, y de entregar al proveedor el comprobante de la retención para que este la use en su propia declaración.",
          ),
        },
        {
          title: "Errores frecuentes y cómo evitarlos",
          summary: "Lo que más multas genera en los negocios pequeños.",
          type: "TEXT",
          minutes: 10,
          content: p(
            "Los errores más comunes son: registrar compras sin comprobante fiscal válido, mezclar los gastos personales con los del negocio, presentar las declaraciones tarde y no conciliar los formatos 606 y 607 con la contabilidad.",
            "Una buena práctica es cerrar cada mes con una lista de control: comprobantes revisados, formatos enviados, declaraciones presentadas y pagos realizados, con la fecha y el número de confirmación.",
            "Guarda los documentos de soporte de forma ordenada. Ante una revisión de la DGII, poder demostrar cada registro con su factura ahorra tiempo y dinero.",
          ),
        },
      ],
    },
  ],
  assignments: [
    {
      title: "Cálculo del ITBIS de la papelería",
      instructions: p(
        "Resuelve la actividad «Declara el ITBIS del mes» con todo el procedimiento.",
        "Explica en una oración por qué una de las compras no da derecho a deducir el ITBIS.",
      ),
      maxScore: 100,
      answers: [
        "ITBIS facturado: (185,000 + 95,000) × 0.18 = RD$50,400. ITBIS adelantado deducible: (160,000 + 12,000) × 0.18 = RD$30,960. ITBIS a pagar: RD$19,440. La compra de RD$8,000 no se deduce porque no tiene comprobante fiscal válido.",
        "Facturado RD$50,400, adelantado RD$30,960, a pagar RD$19,440. No se puede deducir la compra sin NCF.",
      ],
    },
    {
      title: "Lista de control del cierre fiscal mensual",
      instructions: p(
        "Diseña una lista de control para el cierre fiscal de un negocio pequeño.",
        "Incluye cada obligación mensual, quién es responsable, la fecha límite y dónde se guarda la evidencia de que se cumplió.",
      ),
      maxScore: 100,
      answers: [
        "1) Revisar comprobantes de compras — auxiliar contable — primera semana. 2) Enviar 606 y 607 — contador. 3) Declarar IT-1 — contador. 4) Pagar TSS — administración. Cada evidencia se guarda en una carpeta digital por mes con el acuse de la DGII.",
      ],
    },
  ],
  exam: {
    title: "Prueba: RNC, comprobantes e ITBIS",
    instructions: "Tienes 30 minutos y dos intentos.",
    questions: [
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué institución administra el ITBIS y el impuesto sobre la renta?", options: ["La DGA", "La DGII", "La TSS", "El Banco Central"], correctIndex: 1, explanation: "La Dirección General de Impuestos Internos administra los impuestos internos." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Cuál es la tasa general del ITBIS?", options: ["10 %", "16 %", "18 %", "27 %"], correctIndex: 2, explanation: "La tasa general es 18 %; algunos bienes tienen tasa reducida o están exentos." },
      { type: "MULTIPLE_CHOICE", prompt: "Si se facturan RD$90,000 de ITBIS y se pagan RD$54,000 deducibles, ¿cuánto se paga?", options: ["RD$144,000", "RD$54,000", "RD$36,000", "RD$90,000"], correctIndex: 2, explanation: "ITBIS a pagar = facturado − adelantado = 36,000." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué significa NCF?", options: ["Número de Control Financiero", "Número de Comprobante Fiscal", "Nota de Crédito Final", "Número de Cuenta Fiscal"], correctIndex: 1, explanation: "Es el Número de Comprobante Fiscal autorizado por la DGII." },
      { type: "MULTIPLE_CHOICE", prompt: "¿Qué es una retención?", options: ["Un descuento comercial", "Un impuesto que paga el banco", "Una parte del pago que quien paga entrega a la DGII a nombre de quien cobra", "Una multa por pagar tarde"], correctIndex: 2, explanation: "Quien paga retiene y entrega el impuesto a nombre del proveedor." },
      { type: "TRUE_FALSE", prompt: "Una compra sin comprobante fiscal válido permite deducir el ITBIS pagado.", answer: "Falso", explanation: "Sin comprobante válido no hay derecho a deducir." },
      { type: "TRUE_FALSE", prompt: "Presentar una declaración tarde puede generar recargos aunque no haya impuesto a pagar.", answer: "Verdadero", explanation: "El retraso en la presentación también se sanciona." },
    ],
  },
  liveClass: {
    title: "Conversatorio: facturación electrónica",
    description: "Invitado: un contador que ya trabaja con comprobantes electrónicos. Traigan preguntas.",
    time: "18:00",
    durationMinutes: 90,
    daysFromToday: 6,
    weeks: 1,
  },
};
