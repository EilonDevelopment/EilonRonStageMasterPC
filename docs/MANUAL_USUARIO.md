# Manual de usuario — Ron Stage Master

**Aplicación:** EilonRonStage (Ron Stage Master)  
**Versión de referencia:** 1.5.0  
**Fabricante:** Eilon Engineering  

---

## Índice general

- **Parte I — Introducción**
  1. Acerca de este manual
  2. Descripción general
  3. Requisitos
- **Parte II — Navegación y conceptos básicos**
  4. Menú principal y módulos
  5. Conceptos que debe conocer
- **Parte III — Configuración del proyecto**
  6. Crear y seleccionar un proyecto
  7. Ajustes generales del proyecto (More Settings)
  8. Settings — Celdas de carga (LCs)
  9. Settings — Grupos y overload de grupo
- **Parte IV — Monitor View**
  10. Acceso a Monitor y checklist inicial
  11. Componentes de la pantalla
  12. Modo View — plano y layout
  13. Modos List, Prog y Stop
  14. Planes de monitor (Monitor Plans)
  15. Botones y acciones
  16. Alarmas y avisos
- **Parte V — Conexión al PRR**
  17. Connect Device
  18. Operación con PRR conectado
- **Parte VI — Reportes**
  19. Reports
- **Parte VII — Resolución de problemas y buenas prácticas** *(este documento)*
  20. Errores frecuentes
  21. Secuencia recomendada en obra
  22. FAQ
- **Apéndices** *(este documento)*
  A. Capacidades por ID de celda
  B. Estructura de archivos exportados
  C. Contacto y soporte

---

# Parte I — Introducción

## 1. Acerca de este manual

### 1.1 Propósito

Este manual describe el uso operativo de **Ron Stage Master** (también identificada en el dispositivo como **EilonRonStage**): una aplicación móvil para **configurar, monitorear y documentar** el peso de celdas de carga (LC) en montajes de escenario, rigging y aplicaciones industriales similares.

El documento sigue el **orden de trabajo recomendado en obra**: primero configurar el proyecto y las celdas, luego operar la pantalla de Monitor y, cuando corresponda, conectar el receptor inalámbrico (PRR) y exportar reportes.

### 1.2 A quién va dirigido

| Perfil | Uso principal de este manual |
|--------|------------------------------|
| **Operador en campo** | Monitor en vivo, lectura de pesos, alarmas, Zero y Tare durante el montaje |
| **Técnico de rigging / load monitoring** | Alta y edición de celdas, grupos, overloads, planes de monitor y layout en pantalla |
| **Supervisor / responsable de proyecto** | Ajustes globales del proyecto, reportes históricos, exportación PDF/CSV y cabecera de informes |

No se requiere conocimiento de programación. Sí se asume familiaridad básica con celdas de carga Eilon, el PRR y los conceptos de carga segura (WLL, overload, underload).

### 1.3 Qué cubre y qué no cubre

**Incluido en este manual**

- Creación y configuración de proyectos
- Settings: celdas, grupos y overloads
- Pantalla Monitor (View, List, Prog, Stop)
- Conexión Bluetooth al PRR
- Reportes y exportaciones
- Errores frecuentes y buenas prácticas

**Fuera de alcance**

- Mantenimiento físico de celdas de carga o del PRR
- Procedimientos de certificación normativa (el manual describe la app, no sustituye normas locales)
- Funciones no utilizadas en su despliegue (p. ej. módulos ocultos del menú)

### 1.4 Convenciones usadas en el documento

| Símbolo / formato | Significado |
|-------------------|-------------|
| **Texto en negrita** | Nombre visible en pantalla (botón, menú, campo) |
| `Código / ruta` | Valor técnico, ID de celda o clave interna |
| ⚠️ **Advertencia** | Acción irreversible o riesgo de seguridad (p. ej. **Zero**) |
| ℹ️ **Nota** | Información útil que no bloquea el flujo |
| Pasos numerados | Secuencia que debe seguirse en orden |

**Ejemplos de nombres en la interfaz (inglés por defecto)**

La aplicación muestra la interfaz principalmente en inglés. Algunos elementos citados en este manual:

- **Projects**, **Settings**, **Monitor**, **Reports**, **Connect Device**
- **More Settings**, **Total Overload**, **Pre-overload Warning**
- **Before You Start**, **TARE**, **ZERO**, **Tr.Err**

Si el idioma del dispositivo está configurado en japonés u otro idioma soportado, los textos equivalentes aparecerán traducidos; la función es la misma.

### 1.5 Versiones

- **Versión del manual:** 1.0 — documento completo  
- **Versión de la aplicación:** 1.5.0 (visible en el menú lateral inferior: `version-1.5.0`)

Si su instalación muestra otra versión, algunas capturas o nombres de botones pueden diferir levemente; la lógica operativa descrita sigue siendo válida salvo indicación contraria en las notas de versión.

---

## 2. Descripción general

### 2.1 Qué hace Ron Stage Master

Ron Stage Master es la **consola de monitoreo de carga** para trabajos con celdas de carga Eilon. La aplicación:

1. **Organiza el trabajo por proyectos** — cada montaje o espectáculo puede tener su propia configuración de celdas, grupos, límites y diseño de pantalla.
2. **Recibe datos en tiempo real** del **PRR** (receptor portátil) vía **Bluetooth Low Energy (BLE)**.
3. **Muestra el peso** de cada celda y de cada grupo, con indicadores de batería, alarmas de overload/underload y estado de transmisión.
4. **Registra histórico** de lecturas (cuando el ciclo de reportes está activo) para consulta y exportación posterior.
5. **Exporta** instantáneas del monitor y reportes en **CSV** y **PDF**, con cabecera personalizable (logo, artista, ciudad, web, código QR).

La app está pensada para usarse **en el lugar de trabajo**, normalmente con el dispositivo en **orientación horizontal (apaisada)**.

### 2.2 Componentes del sistema

```
┌─────────────────┐     radio      ┌──────────────┐     BLE      ┌─────────────────────┐
│  Celdas de      │ ◄────────────► │     PRR      │ ◄──────────► │  Tablet / teléfono  │
│  carga (LC)     │                │  (receptor)  │              │  Ron Stage Master   │
└─────────────────┘                └──────────────┘              └─────────────────────┘
```

| Componente | Descripción |
|------------|-------------|
| **Celda de carga (LC)** | Sensor inalámbrico que mide la carga. Cada LC tiene un **ID numérico** (p. ej. 1000, 1500). La app asigna capacidad nominal según el rango de ID. |
| **PRR** | Receptor que agrega las señales de las celdas y las entrega a la app por Bluetooth. Debe estar **encendido** y dentro del alcance radio/BLE. La app permite conectar **hasta 2 PRR** simultáneamente. |
| **Proyecto** | Contenedor de toda la configuración: unidades, overload total, celdas, grupos, imagen de fondo del monitor, planes de monitor y datos de reporte. |
| **Grupo** | Conjunto lógico de celdas (p. ej. “Front”, “Rear”). Cada grupo tiene su propio **overload**; es obligatorio para poder abrir Monitor. |
| **Dispositivo móvil** | iPhone, iPad o tablet/smartphone Android con la app instalada. Los datos del proyecto se almacenan **localmente** en el dispositivo. |

### 2.3 Flujo de trabajo típico

El orden que refleja el uso real en obra es:

1. **Crear o seleccionar un proyecto**
2. **Configurar ajustes generales** (Total Overload, Pre-overload, ciclo de reportes)
3. **Dar de alta las celdas** en Settings y marcar al menos una en modo **Total Sum**
4. **Crear grupos** y definir el **overload de cada grupo**
5. **Abrir Monitor** y disponer las celdas en el layout (modo View)
6. **Conectar el PRR** por Bluetooth
7. **Hacer Zero** de las celdas antes de aplicar carga
8. **Monitorear** pesos y alarmas; exportar snapshot o reportes según necesidad

> ℹ️ **Nota:** Es posible abrir Monitor y configurar el layout **antes** de conectar el PRR. Sin embargo, no habrá lecturas en vivo hasta que el PRR esté conectado y las celdas transmitan correctamente.

### 2.4 Módulos principales de la aplicación

| Módulo | Función resumida |
|--------|------------------|
| **Projects** | Crear, seleccionar, duplicar, eliminar, exportar e importar proyectos |
| **Settings** | Celdas de carga, grupos, overload por grupo |
| **Monitor** | Pantalla principal de monitoreo en vivo (View / List / Prog / Stop) |
| **Reports** | Consulta de histórico por fechas y exportación CSV/PDF |
| **Connect Device** | Escaneo BLE y conexión al PRR |

El menú lateral también permite cambiar **idioma** (inglés / japonés) y **tema** claro u oscuro.

### 2.5 Almacenamiento de datos

- La configuración del proyecto y el histórico de reportes se guardan en el **almacenamiento local** del dispositivo (base de datos interna de la app).
- La exportación de proyecto (CSV) y de reportes permite **respaldar** o transferir información a otro dispositivo o a un PC.
- No es necesaria conexión a Internet para el monitoreo en vivo ni para la configuración básica.

---

## 3. Requisitos

### 3.1 Plataformas soportadas

Ron Stage Master es una aplicación **nativa** para:

| Plataforma | Estado |
|------------|--------|
| **iOS / iPadOS** | Soportado (instalación vía App Store / TestFlight según su canal de distribución) |
| **Android** | Soportado (instalación vía Google Play o APK interno según su canal) |

La aplicación está optimizada para **pantalla en apaisado (landscape)**. En iOS el dispositivo se usa en orientación horizontal; en Android la actividad principal está fijada en landscape.

> ℹ️ **Recomendación:** Use una **tablet** (iPad o Android) para Monitor View: el layout con imagen de fondo y múltiples celdas requiere espacio horizontal.

### 3.2 Hardware necesario

| Elemento | Requisito |
|----------|-----------|
| Dispositivo móvil | Bluetooth BLE integrado; espacio libre suficiente para la app y datos de reporte |
| PRR Eilon | Encendido, con batería adecuada, dentro del alcance de las celdas y del dispositivo |
| Celdas de carga | Encendidas; IDs configurados en la app coincidentes con los dispositivos físicos |
| Cargador / batería externa | Recomendado en montajes largos para tablet y PRR |

### 3.3 Bluetooth y permisos

La conexión al PRR usa **Bluetooth Low Energy**. Antes del primer escaneo, el sistema operativo puede solicitar permisos.

**En iOS / iPadOS**

- Permiso de **Bluetooth** — la app lo usa para conectar al PRR y mantener la comunicación durante el monitoreo, incluso en segundo plano.
- Active **Bluetooth** en Ajustes del sistema si el escaneo no encuentra dispositivos.

**En Android**

- **Bluetooth** activado.
- **Servicios de ubicación (GPS)** activados — Android exige ubicación para el escaneo BLE; la app comprueba este requisito antes de escanear.
- Permisos de **Bluetooth Scan** y **Bluetooth Connect** (según versión de Android).

Si Bluetooth está apagado o, en Android, la ubicación está desactivada, la app mostrará un aviso y **no iniciará el escaneo** hasta corregirlo.

### 3.4 Condiciones del entorno de trabajo

Para un monitoreo fiable:

| Condición | Detalle |
|-----------|---------|
| PRR encendido | Verificar antes de conectar; la app muestra el estado de enlace en Monitor |
| Celdas encendidas | Sin alimentación no hay transmisión al PRR |
| Sin obstáculos graves | Interferencias o distancia excesiva pueden causar **Tr.Err** (error de transmisión) |
| Overloads configurados | Total Overload, Pre-overload y overload de grupo deben estar definidos antes de operar con alarmas |
| Zero antes de cargar | Aplicar peso sin haber hecho Zero puede invalidar la referencia de peso |

La pantalla **Before You Start** (al entrar en Monitor) resume varias de estas comprobaciones.

### 3.5 Requisitos previos de configuración (resumen)

Antes de que Monitor View sea operativo, la app exige como mínimo:

1. Un **proyecto activo**
2. **Total Overload** y **Pre-overload** distintos de cero en More Settings
3. Al menos **una celda** con modo **Total Sum** activado
4. Al menos **un grupo** con **overload** definido (no vacío y no cero)

Si falta alguno de estos puntos, al intentar abrir Monitor la aplicación mostrará un mensaje de error indicando qué debe corregirse en Settings o en el proyecto.

### 3.6 Buenas prácticas antes de empezar en obra

1. **Cree el proyecto con antelación** o duplique uno de referencia si el montaje es recurrente.
2. **Verifique los IDs de celda** frente a las etiquetas físicas de cada LC.
3. **Defina overloads realistas** por grupo y a nivel de proyecto, acordes al WLL del montaje.
4. **Pruebe la conexión PRR** en un entorno sin carga antes del día del montaje.
5. **Compruebe el nivel de batería** de celdas y PRR (visible en Monitor).
6. **Exporte el proyecto** (CSV) como respaldo antes de cambios masivos.
7. Mantenga el dispositivo **cargado** y con Bluetooth activo durante todo el evento.

---

# Parte II — Navegación y conceptos básicos

## 4. Menú principal y módulos

### 4.1 Cómo abrir el menú

El menú lateral es el punto de acceso a todos los módulos de la aplicación.

1. Pulse el icono de **hamburguesa** (☰) en la esquina superior izquierda de la barra de herramientas.
2. Se despliega el panel lateral con el logotipo de Eilon, el selector de idioma, el interruptor de tema y la lista de módulos.

> ℹ️ **Nota:** El menú **no** se abre deslizando desde el borde de la pantalla; solo mediante el botón ☰. Esto evita confusiones con otros gestos en tablet.

Para cerrar el menú, seleccione un módulo (el menú se cierra automáticamente) o pulse fuera del panel.

### 4.2 Módulos visibles en el menú

La aplicación muestra **cinco entradas** en el menú principal:

| Entrada en menú | Comportamiento al pulsar |
|-----------------|--------------------------|
| **Monitor** | Abre la pantalla de monitoreo en vivo (pantalla completa). Valida requisitos previos; si falta configuración, muestra un error. |
| **Projects** | Abre un **cuadro de diálogo** (modal) con la lista de proyectos. |
| **Settings** | Abre la pantalla **Settings** (pantalla completa) del proyecto activo. |
| **Reports** | Abre la pantalla **Reports** (pantalla completa) para consultar histórico. |
| **Connect Device** | Abre un **cuadro de diálogo** para escanear y conectar el PRR por Bluetooth. |

**Diferencia entre pantalla y modal**

- **Pantalla completa** (Monitor, Settings, Reports): ocupa toda la interfaz; la barra superior muestra herramientas propias de cada módulo.
- **Modal** (Projects, Connect Device): ventana superpuesta sobre la pantalla actual; al cerrarla vuelve a lo que estaba visible antes.

Al iniciar la app, la ruta por defecto es **Monitor**. Si el proyecto aún no cumple los requisitos, Monitor mostrará el mensaje correspondiente o propondrá crear un proyecto.

### 4.3 Barra superior común

En la mayoría de pantallas, la barra superior incluye:

| Elemento | Ubicación | Función |
|----------|-----------|---------|
| **Menú ☰** | Izquierda | Abre el menú lateral |
| **Nombre del proyecto** | Centro / derecha | Muestra el proyecto activo (p. ej. `Mi Show - Monitoring Screen`) |
| **Units: …** | Izquierda (solo en Monitor) | Muestra la unidad de peso activa; al pulsar, abre el selector KG / LBS / M.TON |
| **Iconos de Monitor** | Derecha (solo en Monitor) | Modo de vista, MAX, TARE, LOAD, warnings, export snapshot — ver Parte IV |

En **Settings**, la barra incluye un acceso rápido a **More Settings** (engranaje) y muestra la unidad de peso del proyecto.

### 4.4 Idioma

En la parte superior del menú lateral hay un selector de idioma:

| Opción | Idioma |
|--------|--------|
| **English** | Inglés (predeterminado) |
| **日本語** | Japonés |

El idioma elegido se guarda en el dispositivo y se mantiene al reiniciar la aplicación.

> ℹ️ **Nota:** Los nombres de algunos módulos técnicos (p. ej. *Monitor*, *Settings*) pueden permanecer en inglés incluso con japonés seleccionado, según la traducción disponible.

### 4.5 Tema claro / oscuro

Junto al selector de idioma aparece un icono de **sol** o **luna**:

| Icono | Acción |
|-------|--------|
| **Sol** ☀️ | Tema claro activo — pulse para cambiar a oscuro |
| **Luna** 🌙 | Tema oscuro activo — pulse para cambiar a claro |

La preferencia se guarda automáticamente. Si no ha elegido tema antes, la app adopta el del sistema operativo (claro u oscuro según el dispositivo).

El tema afecta a fondos, textos, iconos y logotipo del menú, pero **no** cambia la lógica de alarmas (overload y danger siguen mostrándose en rojo).

### 4.6 Versión de la aplicación

En la parte inferior del menú lateral se muestra la versión instalada, por ejemplo:

`version-1.5.0`

Úsela al contactar soporte técnico para identificar su build.

### 4.7 Orden recomendado de uso del menú

Para un montaje nuevo, el recorrido habitual por el menú es:

```
Projects  →  Settings  →  Monitor  →  Connect Device  →  Reports
 (crear)     (LCs +        (layout +      (PRR BLE)         (histórico /
             grupos)       monitoreo)                       export)
```

No es obligatorio seguir este orden al pie de la letra cada vez que abre la app, pero **la configuración en Settings debe estar completa antes de que Monitor sea plenamente operativo**.

---

## 5. Conceptos que debe conocer

Esta sección define los términos que aparecen en pantalla, en las alarmas y en los reportes. Conocerlos facilita la configuración (Parte III) y el uso de Monitor (Parte IV).

### 5.1 Proyecto

Un **proyecto** es el contenedor de todo el trabajo de un montaje o evento:

- Nombre y unidades de medida
- Límites globales (Total Overload, Pre-overload)
- Lista de celdas de carga y sus parámetros
- Grupos y overload por grupo
- Diseño de Monitor (imagen, posiciones, planes)
- Datos de reporte y cabecera de exportación

Solo hay **un proyecto activo** a la vez. Lo que ve en Settings y Monitor corresponde siempre al proyecto seleccionado en **Projects**.

### 5.2 Celda de carga (LC)

Cada **LC** (Load Cell) es un sensor inalámbrico identificado por un **ID numérico** (por ejemplo `1000`, `1500`, `2500`).

En la app, cada LC tiene:

| Campo | Significado |
|-------|-------------|
| **Id** | Número de serie / ID de la celda física |
| **Name** | Nombre descriptivo (opcional) |
| **Capacity** | Capacidad nominal según el ID (kg, lbs o M.TON) |
| **Underload** | Umbral inferior de alarma (valor en unidades del proyecto) |
| **Overload** | Umbral superior de alarma para la celda individual |
| **P.S.W** | Peso preestablecido — ver más abajo en el glosario |
| **Total** | Si está activo (**Total Sum**), la celda suma al peso total mostrado en la cabecera de Monitor |

La capacidad nominal se asigna automáticamente según el rango del ID (véase Apéndice A).

### 5.3 Grupo

Un **grupo** agrupa varias celdas bajo un mismo nombre lógico (p. ej. `Front`, `Grid A`, `Motor Left`).

- Cada LC puede pertenecer a uno o más grupos (campo **Group** en Settings).
- Cada grupo tiene un **overload** propio: límite de peso agregado del grupo.
- El overload de grupo **no puede ser 0 ni estar vacío** si quiere abrir Monitor.

Las acciones **TARE** y **ZERO** de grupo operan sobre todas las celdas del grupo seleccionado.

### 5.4 PRR

El **PRR** es el receptor portátil Eilon que:

1. Recibe por radio las señales de las celdas de carga.
2. Las reenvía a la app mediante **Bluetooth Low Energy (BLE)**.

En Monitor, el estado del PRR se indica con un icono de enlace Bluetooth y, si está conectado, el **nombre del dispositivo** y el **porcentaje de batería** del PRR.

- Puede conectar **hasta 2 PRR** simultáneamente.
- Sin PRR conectado, las celdas muestran **Tr.Err** y no hay lecturas en vivo.

La conexión se gestiona desde **Connect Device** (Parte V).

### 5.5 Unidades de peso

El proyecto trabaja en una de estas unidades de peso:

| Código en app | Nombre | Uso típico |
|---------------|--------|------------|
| **KG** | Kilogramos | Europa, montaje general |
| **LBS** | Libras | EE. UU., UK |
| **M.TON** | Tonelada métrica | Cargas muy pesadas |

La unidad activa se muestra en la cabecera de Monitor como un botón de texto, por ejemplo **Units: KG**.

**Para cambiar la unidad:** en Monitor View, pulse ese texto (**Units: KG**, **Units: LBS**, etc.). Se abre un cuadro de diálogo donde puede elegir **KG**, **LBS** o **M.TON** y confirmar con **Ok**.

> ℹ️ **Nota:** El cambio de unidad afecta a todo el proyecto activo (lecturas, overloads mostrados y totales).

**Resolución de visualización:** según la capacidad de la celda, el peso se muestra con distinto número de decimales (p. ej. enteros en kg/lbs para muchas capacidades, tres decimales en M.TON).

### 5.6 Glosario de términos operativos

#### Gross (peso bruto)

Peso **mostrado en pantalla** después de aplicar el **Zero** de la celda, pero **antes** de restar la tara de grupo cuando el modo NET está activo.

Es el valor habitual para comprobar overload y danger en las alarmas de seguridad.

#### Net (peso neto)

Peso con la **tara de grupo** descontada. Solo se muestra cuando:

1. La celda está en modo tara de grupo (`status_tare` activo), **y**
2. El interruptor **TARE** de la barra superior de Monitor está activado.

Las celdas en tara pueden marcarse visualmente como **NET** en el icono de la celda.

#### Tare (tara)

Operación que **resta el peso actual del grupo** para medir solo el incremento de carga (peso neto).

- Se aplica por **grupo** desde las acciones de grupo o la barra de herramientas.
- **Cancel Tare** revierte la tara del grupo.
- La tara de un grupo **no afecta** a las celdas de otros grupos que sigan en tara.

> ℹ️ **Nota:** El botón **TARE** de la barra superior no ejecuta la tara; **alterna la visualización** entre Gross y Net para las celdas que ya están en modo tara.

#### Zero (cero)

Operación que **redefine el punto cero** de la celda o del grupo. Es **irreversible** y requiere **doble confirmación** en pantalla.

Efectos principales:

- Ajusta la referencia de peso de la(s) celda(s).
- Restablece el **P.S.W** de la celda a cero.

⚠️ **Advertencia:** La app **bloquea el Zero** si la carga bruta en el sensor supera el **30 % de la capacidad nominal** de la celda. Debe descargar antes de hacer Zero.

Siempre haga Zero **antes de aplicar la carga de trabajo**, con las celdas descargadas y transmitiendo correctamente (sin Tr.Err).

#### P.S.W (Peso preestablecido)

**P.S.W** (*Preset Starting Weight* / peso preestablecido) es un **offset numérico** configurado por celda en Settings. Se suma al peso mostrado para compensar peso de aparejo fijo u otros ajustes.

- Se edita en la ficha de cada LC en Settings.
- No puede ser negativo.
- Al confirmar un **Zero**, el P.S.W de esa celda vuelve a **0**.

#### Tr.Err (error de transmisión)

**Tr.Err** (*Transmission Error*) indica que la app **no recibe una lectura válida** de esa celda.

Causas habituales:

- PRR desconectado o fuera de alcance
- Celda apagada o fuera de alcance del PRR
- Interferencia o pérdida momentánea de señal

Mientras aparece Tr.Err, **no** debe tomar decisiones de carga basadas en esa lectura. Las alarmas de overload no se evalúan sobre Tr.Err.

#### Overload

Estado de alarma cuando el peso **supera el límite superior** configurado:

| Nivel | Condición (simplificada) |
|-------|--------------------------|
| **Overload** (celda o grupo) | Peso > overload configurado |
| **TOTAL OVERLOAD** | Suma total > Total Overload del proyecto |
| **PRE OVERLOAD** | Peso > umbral de pre-aviso (ver § 5.7) |

El icono o fondo de la celda/grupo cambia de color y aparece un aviso en pantalla con sonido.

#### Danger

Estado de alarma **severa** cuando el peso alcanza o supera el **130 % del overload** configurado (factor × 1,3).

Se muestra como **DANGER** en los avisos. Indica sobrecarga crítica; debe actuar de inmediato según su procedimiento de seguridad.

#### Underload

Estado de alarma cuando el peso **cae por debajo del umbral inferior** (*underload*) definido para la celda.

El valor por defecto al crear celdas es **-10** (en las unidades del proyecto). Puede editarse por celda en Settings. Debe ser **menor o igual** que el overload de la celda.

#### Total Sum

Modo de celda (**Total** en Settings) que indica que esa LC **contribuye al peso total** mostrado en la cabecera de Monitor (**Total Weight**).

**Requisito:** al menos **una celda** del proyecto debe tener Total Sum activo para poder abrir Monitor.

No todas las celdas del montaje necesitan estar en Total Sum — solo las que deben sumar al total global.

### 5.7 Límites a nivel de proyecto

Además de los límites por celda y por grupo, existen dos parámetros globales en **More Settings**:

| Parámetro | Función |
|-----------|---------|
| **Total Overload** | Límite de peso para la **suma total** de celdas en Total Sum. Obligatorio (no puede ser 0). |
| **Pre-overload Warning** | Porcentaje (1–99) que define un **aviso anticipado** antes de llegar al overload. Ejemplo: con overload 1000 y pre-overload 80 %, el aviso aparece por encima de 800. Obligatorio (no puede ser 0). |

### 5.8 Modos de visualización en Monitor (resumen)

Al pulsar el icono de modo en la barra de Monitor, la pantalla alterna entre:

| Modo | Descripción breve |
|------|-------------------|
| **View** | Plano con imagen de fondo y celdas posicionadas |
| **List** | Tabla con todas las lecturas |
| **Prog** | Barras de progreso respecto al overload |
| **Stop** | Vista de parada / resumen |

El ciclo es: View → List → Prog → Stop → View…

La descripción detallada de cada modo está en la Parte IV.

### 5.9 Interruptores LOAD y MAX (cabecera de Monitor)

| Interruptor | Función |
|-------------|---------|
| **LOAD** | Alterna en los iconos de celda entre mostrar **peso** o **batería** |
| **MAX** | Muestra el **valor máximo** registrado en la sesión en lugar del peso instantáneo (activa LOAD automáticamente) |

### 5.10 Resumen visual de relaciones

```
Proyecto
 ├── More Settings (Total Overload, Pre-overload, reportes)
 ├── Unidades de peso (cambio rápido desde Monitor → Units: …)
 ├── Celdas (LC) ── pertenecen a ──► Grupos (cada uno con overload)
 ├── Monitor Plans (layouts e imágenes por plan)
 └── Reports (histórico)

PRR (BLE) ── transmite ──► Celdas (radio) ──► Lecturas en Monitor
```

---

# Parte III — Configuración del proyecto

> **Orden recomendado:** cree o seleccione el proyecto → configure **More Settings** → dé de alta las **celdas** → defina el **overload de cada grupo** → abra **Monitor**.

---

## 6. Crear y seleccionar un proyecto

### 6.1 Abrir la lista de proyectos

1. Pulse el menú **☰** y seleccione **Projects**.
2. Se abre el cuadro **Project List** con la lista de proyectos existentes.

En la parte superior hay un campo **Search** para filtrar por nombre.

### 6.2 Seleccionar un proyecto activo

- Pulse el **nombre** del proyecto en la lista.
- El proyecto queda activo y el cuadro se cierra.
- La app carga la configuración de ese proyecto (celdas, grupos, ajustes).

Todo lo que vea después en **Settings** y **Monitor** corresponde al proyecto activo.

### 6.3 Crear un proyecto nuevo

1. En **Project List**, pulse **Create New Project**.
2. En el cuadro que aparece, escriba el **nombre del proyecto** (*Enter Project Name*).
3. Pulse **Ok**.

**Comportamiento de la app**

- Si deja el nombre vacío, se usa **Untitled**.
- No se permiten **nombres duplicados**; si el nombre ya existe, verá un error y deberá elegir otro.
- Tras crear el proyecto, la app abre automáticamente **More Settings** para que defina los parámetros iniciales (véase capítulo 7).
- Al guardar More Settings, la app le lleva a la pantalla **Settings** para continuar con las celdas.

**Valores por defecto de un proyecto nuevo**

| Parámetro | Valor inicial |
|-----------|---------------|
| Unidades de peso | KG |
| Total Overload | 500 (en kg; se ajusta si cambia unidad) |
| Pre-overload Warning | 100 % |
| Reports Cycle | Desactivado |
| Report interval | 60 segundos |

### 6.4 Duplicar un proyecto

Útil para reutilizar la configuración de un montaje anterior.

1. Abra **Settings** del proyecto que desea copiar.
2. En la barra superior, pulse el botón **Duplicate** (icono de duplicar).
3. Se abre **Create New Project** — escriba un **nombre nuevo** para la copia.
4. Pulse **Ok**.

La copia incluye celdas, grupos y ajustes del proyecto origen. Debe revisar overloads y nombres antes de usarla en obra.

### 6.5 Eliminar un proyecto

1. Abra **Settings** del proyecto activo.
2. Pulse **Delete** (icono de papelera) en la barra superior.
3. En el cuadro **Delete Project**, seleccione el proyecto a eliminar.
4. Confirme la eliminación.

⚠️ **Advertencia:** La eliminación es **definitiva** para ese proyecto en el dispositivo (configuración y datos asociados). Exporte antes si necesita respaldo.

### 6.6 Exportar un proyecto (CSV)

1. Abra **Projects** → **Project List**.
2. Junto al nombre del proyecto, pulse el icono de **descarga** (Export).
3. En dispositivo móvil, se genera un archivo CSV y se abre el menú **compartir** del sistema (guardar en archivos, enviar por correo, etc.).
4. En navegador web, el archivo se descarga directamente.

Use la exportación como **respaldo** o para transferir la configuración a otro dispositivo.

### 6.7 Importar un proyecto (CSV)

1. Abra **Projects** → **Project List**.
2. Pulse **Import** (parte inferior del cuadro).
3. Seleccione un archivo **CSV** exportado previamente desde Ron Stage Master.

**Si ya existe un proyecto con el mismo nombre**, la app pregunta:

- **Overwrite** — sustituye el proyecto existente, o
- **Choose new name** — importa con otro nombre.

Si el formato del CSV no es válido, verá *Failed to import project. Check CSV format.*

---

## 7. Ajustes generales del proyecto (More Settings)

### 7.1 Cómo abrir More Settings

Hay dos accesos:

| Desde | Acción |
|-------|--------|
| **Tras crear un proyecto** | Se abre automáticamente |
| **Settings** (pantalla de celdas) | Pulse el botón **Settings** (engranaje) en la barra superior |

El cuadro se titula **More Settings**.

> ℹ️ **Nota sobre unidades:** el cambio habitual de unidad de peso (KG / LBS / M.TON) se hace desde **Monitor**, pulsando **Units: …** en la cabecera (véase § 5.5). More Settings también permite ajustar unidades al crear el proyecto; use el método que le resulte más cómodo.

### 7.2 Campos de More Settings

| Campo | Descripción | Obligatorio |
|-------|-------------|-------------|
| **Units** | Unidad de peso del proyecto: **KG**, **LBS** o **M.TON** | Sí |
| **Total Overload** | Límite de peso para la **suma total** de celdas en Total Sum | Sí — no puede ser 0 |
| **Reports Cycle** | Interruptor que **activa o desactiva** el registro histórico automático | No (off por defecto) |
| **Report interval (seconds)** | Cada cuántos segundos se guarda una muestra en el histórico (1–86400, máx. 24 h) | Solo si Reports Cycle está activo |
| **Pre-overload Warning (%)** | Porcentaje de aviso anticipado respecto al overload (1–99) | Sí — no puede ser 0 |

### 7.3 Total Overload

Define el tope de peso para el **Total Weight** de Monitor (suma de celdas en modo Total Sum).

- Debe ser un valor **mayor que cero**.
- Si supera este límite en Monitor, aparece la alarma **TOTAL OVERLOAD**.
- Al cambiar la unidad del proyecto, la app puede **convertir** el valor de Total Overload a la nueva unidad.

**Ejemplo:** con unidades en KG y Total Overload = 500, la suma de todas las celdas Total Sum no debería superar 500 kg sin disparar alarma.

### 7.4 Pre-overload Warning (%)

Porcentaje que define un **aviso antes** de llegar al overload configurado.

- Valor típico al crear proyecto: **100** (equivale a desactivar el aviso anticipado en la práctica, porque el umbral coincide con el 100 % del overload).
- Para un aviso útil, use un valor entre **1 y 99** (p. ej. **80** = aviso al 80 % del overload).

**Ejemplo:** overload de celda = 1000 kg, pre-overload = 80 % → aviso **PRE OVERLOAD** por encima de 800 kg y **OVERLOAD** por encima de 1000 kg.

### 7.5 Reports Cycle e intervalo

| Opción | Función |
|--------|---------|
| **Reports Cycle** (toggle) | Activado: la app **guarda lecturas** en el histórico para consultarlas en **Reports**. Desactivado: no hay registro automático (Monitor en vivo sigue funcionando). |
| **Report interval (seconds)** | Frecuencia de muestreo. Por defecto **60** s. Rango válido: **1** a **86400** (24 horas). |

Si Reports Cycle está desactivado, al abrir **Reports** verá un mensaje indicando que el ciclo está deshabilitado.

### 7.6 Guardar More Settings

1. Revise todos los campos.
2. Pulse **Ok**.

Si **Total Overload** o **Pre-overload** están vacíos o en cero, la app muestra error y **no guarda**:

- *Total overload can't be 0. Please set it first*
- *Preoverload can't be 0. Please set it first*

Al guardar correctamente, aparece *Project settings successfully updated*.

---

## 8. Settings — Celdas de carga (LCs)

La pantalla **Settings** es el centro de gestión de celdas. Acceda desde el menú **☰ → Settings**.

### 8.1 Vista general de Settings

La pantalla se organiza en tres zonas:

```
┌─────────────────────────────────────────────────────────┐
│  Barra superior: unidades | proyecto | Settings │ Dup │ Del │
├─────────────────────────────────────────────────────────┤
│  Franja de GRUPOS (nombre + overload por grupo)         │
├─────────────────────────────────────────────────────────┤
│  [Add LC]  [Edit LC]                    [Delete LC]     │
│  Total load cells: N                                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Tabla: Id | Name | Capacity | Underload | ...    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

Debajo de los botones se muestra el contador **Total load cells: N**.

### 8.2 Añadir celdas (Add LC)

1. Pulse **Add LC**.
2. Complete el formulario del cuadro **Add LC**:

| Campo | Descripción |
|-------|-------------|
| **Name** | Nombre descriptivo (opcional; puede repetirse en varias celdas del mismo lote) |
| **ID's** | Rango o lista de IDs de celda. Formato: `10-15,18,25-46` (rangos con guión, IDs sueltos separados por coma) |
| **P.S.W** | Peso preestablecido (offset). Por defecto 0 |
| **Underload** | Umbral inferior de alarma. Por defecto **-10** |
| **Overload** | Umbral superior de alarma de la celda. **Obligatorio** y mayor que 0 |
| **Total** (toggle) | **Total Sum** — si está activo, la celda suma al Total Weight de Monitor |
| **Groups** | Casillas de los grupos a los que pertenece la celda (aparecen tras definir grupos) |

3. Pulse **Save**.

**Durante la creación** puede aparecer el mensaje *Creating load cells...* mientras se procesan muchos IDs.

**Validaciones al guardar**

| Error | Causa |
|-------|--------|
| *Overload must be bigger than 0* | Falta overload o es ≤ 0 |
| *Underload can't be higher than Overload* | Underload mayor que overload |
| *P.S.W can't be negative* | PSW negativo |
| *Invalid unit id* | ID no reconocido en la tabla de capacidades |
| *Overload can't be higher than capacity* | Overload supera la capacidad nominal del ID |
| *Those units already added to the project* | Algún ID ya existe en el proyecto |
| *Cannot create new load cells while an overload or underload alert is active* | Hay una alarma activa en pantalla — ciérrela antes de añadir |

**Capacidad automática:** al introducir un ID válido, la app asigna la **capacidad nominal** según el rango del ID (Apéndice A). No es necesario escribir la capacidad manualmente.

**Requisito para Monitor:** marque **Total** en al menos **una** celda del proyecto.

### 8.3 Editar una celda individual

1. En la tabla, pulse cualquier celda de la fila (Id, Name, Capacity, etc.).
2. Se abre **Edit LC** con los datos de esa celda.
3. Modifique los campos necesarios.
4. Pulse **Save**.

También puede **Duplicate** (crear otra celda con los mismos parámetros, introduciendo un ID nuevo) o **Delete** (eliminar solo esa celda) desde el pie del cuadro.

### 8.4 Edición masiva (Edit LC)

Para cambiar el mismo parámetro en varias celdas a la vez:

1. Pulse el botón **Edit LC** (encima de la tabla).
2. En el cuadro de edición masiva, indique los **IDs** objetivo y los campos a sobrescribir (nombre, PSW, underload, overload, Total Sum, grupos).
3. Confirme.

Útil cuando muchas celdas comparten el mismo overload o grupo.

### 8.5 Eliminar celdas

1. Marque la casilla **Check** de cada fila a eliminar (o la casilla del encabezado para **seleccionar todas**).
2. Pulse **Delete LC** (botón rojo).
3. Confirme en el cuadro *Are you sure you want to delete selected Load Cells?*

Las celdas eliminadas desaparecen del proyecto. Si un grupo queda sin celdas asignadas, la app puede **resetear** su overload (deberá volver a configurarlo).

### 8.6 Columnas de la tabla

| Columna | Contenido |
|---------|-----------|
| **#** | Índice en la lista |
| **Id** | ID numérico de la celda |
| **Name** | Nombre |
| **Capacity** | Capacidad nominal en unidades del proyecto |
| **Underload** | Umbral inferior |
| **Overload** | Umbral superior |
| **P.S.W** | Peso preestablecido |
| **Total** | Yes / No (Total Sum) |
| **Groups** | IDs de grupo asignados (p. ej. `1,3`) |
| **Check** | Selección para borrado |

La tabla admite **ordenación** pulsando el encabezado de cada columna.

---

## 9. Settings — Grupos y overload de grupo

Los **grupos** organizan las celdas para Monitor, Tare, Zero y alarmas agregadas. **Sin al menos un grupo con overload definido (> 0), no podrá abrir Monitor.**

### 9.1 Franja de grupos

En la parte superior de **Settings**, una franja horizontal muestra **un recuadro por grupo**:

| Mitad superior | Nombre del grupo (solo si tiene overload configurado) |
|----------------|------------------------------------------------------|
| Mitad inferior | Valor numérico del **overload** del grupo |

- Pulse un recuadro para **editar** ese grupo.
- Los grupos se crean automáticamente al **asignar un ID de grupo** a una celda (véase § 9.2).

### 9.2 Asignar celdas a grupos

Al añadir o editar una celda en **Add LC / Edit LC**, marque las casillas **Groups** correspondientes.

- Los grupos se identifican por **número** (1, 2, 3…).
- Una celda puede pertenecer a **varios grupos**.
- Al guardar una celda con grupos nuevos, la app **activa** esos grupos en la franja superior (con overload inicial en 0 hasta que usted lo defina).

También puede escribir IDs de grupo en edición masiva, separados por coma (p. ej. `1,2`).

### 9.3 Definir el overload de un grupo

1. En la franja de grupos, pulse el recuadro del grupo.
2. Se abre el cuadro **Group N**:

| Campo | Descripción |
|-------|-------------|
| **Group Name** | Nombre visible (p. ej. `Front`, `Grid A`). Por defecto `Grp N` |
| **Overload** | Límite de peso **agregado** del grupo. **Debe ser mayor que 0** |

3. Pulse **Ok**.

**Validación:** si el overload es **0 o está vacío**, verá *Overload must be bigger than 0* y no se guardará.

### 9.4 Requisito para abrir Monitor

Antes de entrar en Monitor, la app comprueba:

| Requisito | Mensaje si falla |
|-----------|------------------|
| Al menos 1 celda en **Total Sum** | *At least 1 LC must be total sum mode* |
| Al menos 1 grupo con overload **> 0** | *You Must First set at Least One Group* |
| Ningún grupo con overload = **0** entre los que tienen valor | *{nombre del grupo} Can't be 0* |

**Secuencia mínima recomendada**

1. Añadir celdas y marcar **Total** en al menos una.
2. Asignar cada celda a su **grupo** (casillas Groups).
3. Pulsar cada grupo en la franja y definir **overload > 0** y nombre.
4. Abrir **Monitor** desde el menú.

### 9.5 Relación grupo ↔ alarmas en Monitor

- El **overload de grupo** es el límite para la **suma de pesos** de las celdas de ese grupo.
- Si se supera, aparece alarma **OVERLOAD** (o **DANGER** si alcanza el 130 % del límite).
- Las acciones **TARE** y **ZERO** de grupo (en Monitor) afectan a todas las celdas del grupo seleccionado.

### 9.6 Comprobación antes de conectar el PRR

Con la configuración de proyecto, celdas y grupos completada, ya puede:

1. Abrir **Monitor** y disponer el layout (Parte IV).
2. Conectar el **PRR** cuando esté listo (Parte V).

No es necesario tener el PRR conectado para configurar Settings, pero **sí** para ver pesos en vivo y para hacer Zero.

---

# Parte IV — Monitor View

Monitor es la pantalla principal de **monitoreo en vivo**. Aquí ve pesos por celda y por grupo, alarmas, estado del PRR y el layout del montaje.

---

## 10. Acceso a Monitor y checklist inicial

### 10.1 Cómo abrir Monitor

1. Menú **☰ → Monitor**.
2. La app comprueba que el proyecto activo cumple los requisitos (Parte III, § 9.4).
3. Si todo es correcto, entra en **Monitoring Screen**.

Si falta configuración, verá un mensaje de error y deberá corregir Settings o More Settings antes de continuar.

> ℹ️ **Nota:** Puede abrir Monitor **sin PRR conectado** para preparar el layout. Las lecturas en vivo y las acciones Zero/Tare requieren PRR conectado.

### 10.2 Checklist «Before You Start»

Antes de aplicar carga en obra, verifique estos puntos (contenido de la lista **Before You Start** de la app):

| # | Comprobación |
|---|--------------|
| 1 | Las **celdas de carga están encendidas** |
| 2 | El **PRR está encendido** |
| 3 | El **overload de cada LC** es el correcto |
| 4 | El **overload de cada grupo** es el correcto |
| 5 | El **Total Overload** del proyecto es el correcto |
| 6 | (Misma verificación de límites totales del proyecto) |
| 7 | La **batería de las celdas** es adecuada para el evento |
| 8 | Ha hecho **ZERO** de las celdas **antes** de aplicar peso |

### 10.3 Secuencia recomendada al entrar en Monitor

1. Comprobar unidades (**Units: …** en cabecera).
2. Conectar PRR (**Connect Device**) cuando vaya a operar con peso real.
3. Disponer celdas en modo **View** (si usa plano con imagen).
4. Hacer **ZERO** con celdas descargadas.
5. Monitorear pesos y alarmas.

---

## 11. Componentes de la pantalla

### 11.1 Esquema general

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰ │ Total Weight │ Units: KG │ BLE/PRR │ Proyecto | Plan │ ⚠ │ modo │ MAX │ TARE │ LOAD │ 📄 │
├──────────────────────────────────────────────────────────────────────────┤
│  Grupo 1  │  Grupo 2  │  Grupo 3  │ ...  (peso sumado por grupo)         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   [Home]  │              Área principal (View / List / Prog / Stop)      │
│   col.    │                                                              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Cabecera (barra superior)

| Elemento | Función |
|----------|---------|
| **☰** | Menú lateral |
| **Total Weight** | Suma de celdas en **Total Sum**. En rojo si supera Total Overload o si no hay PRR |
| **Units: KG** (etc.) | Unidad activa; **pulse** para cambiar KG / LBS / M.TON |
| **Icono Bluetooth + nombre PRR** | Estado de enlace; batería del PRR (%). Pulse nombre o batería para **desconectar** |
| **Nombre proyecto — Monitoring Screen** | Proyecto activo |
| **Nombre del plan** (p. ej. *General Plan*) | Pulse para abrir el diálogo **Plans** |
| **Icono ⚠ (warnings)** | Abre el historial de avisos de la sesión |
| **Icono de modo** | Alterna View → List → Prog → Stop → View… |
| **MAX** | Muestra valor **máximo** de sesión en las celdas (activa LOAD) |
| **TARE** | Alterna visualización **Gross / Net** (no ejecuta tara por sí solo) |
| **LOAD** | Alterna en iconos de celda: **peso** o **batería** |
| **Icono documento** | **Export snapshot** (CSV o PDF) |

### 11.3 Franja de grupos

Debajo de la cabecera, una fila de **recuadros por grupo**:

| Mitad superior | Nombre del grupo (fondo azul; rojo si overload de grupo) |
|----------------|----------------------------------------------------------|
| Mitad inferior | **Peso sumado** del grupo en unidades del proyecto |

Sin PRR conectado, la suma muestra **Tr.Err**.

El recuadro del grupo **seleccionado visualmente** (resaltar / mostrar solo) lleva un **anillo azul** alrededor.

### 11.4 Área principal

Según el modo activo (icono de modo en cabecera):

| Modo | Componente |
|------|------------|
| **View** | Columna **Home** + escenario con imagen de fondo (opcional) y celdas |
| **List** | Tabla con Id, Name, Load, Battery, Underload, Overload, etc. |
| **Prog** | Mosaico de barras de progreso respecto al overload de cada celda |
| **Stop** | Mosaico de celdas con valor destacado; muestra **DANGER** si aplica |

En **List**, **Prog** y **Stop** la zona hace **scroll vertical** si hay muchas celdas.

### 11.5 Barra lateral de herramientas de layout (solo View)

En el borde derecho del escenario, un panel colapsable (**»** / **«**) con herramientas de imagen y layout (detalle en § 12.4).

---

## 12. Modo View — plano y layout

### 12.1 Columna Home y escenario

**Modo View** divide la pantalla en:

| Zona | Contenido |
|------|-----------|
| **Columna Home** (izquierda) | Celdas **no colocadas** en el plano (posición “home”) |
| **Escenario** (derecha) | Imagen de fondo (opcional) y celdas **colocadas** en el montaje |

Las celdas en Home y en el escenario muestran ID, peso (o batería según LOAD), estado de alarma (color) y anillo si el grupo está resaltado.

### 12.2 Mover celdas entre Home y escenario

| Gesto | Acción |
|-------|--------|
| **Un toque** en celda en **Home** | La envía al **primer hueco libre** del escenario |
| **Doble toque** en celda del **escenario** | La devuelve a **Home** |
| **Arrastrar** celda en el escenario | Cambia su posición en el plano |
| **Arrastrar** celda del escenario hacia la columna Home | La devuelve a Home |

Si hay **muchas celdas en Home**, desplace verticalmente la columna Home (scroll táctil en la franja izquierda).

### 12.3 Imagen de fondo

Puede trabajar **con o sin imagen**. Sin imagen, las celdas colocadas siguen pudiendo ordenarse en el área de escenario.

**Añadir imagen** (barra lateral de layout, § 12.4):

| Botón | Origen |
|-------|--------|
| Icono **galería** | Imagen de la galería del dispositivo |
| Icono **cámara** | Foto nueva |

**Con imagen cargada:**

| Botón | Acción |
|-------|--------|
| **Editar** (lápiz) | Recortar, mover y ajustar zoom de la imagen |
| **Quitar** (×) | Elimina la imagen de fondo del plano actual |

**Zoom del escenario:** con dos dedos puede hacer **pinch-to-zoom** sobre la imagen para acercar o alejar la vista (no cambia el tamaño guardado de la imagen, solo la visualización).

### 12.4 Herramientas de layout (panel derecho)

Pulse **»** para desplegar el panel; **«** para ocultarlo.

| Icono | Función |
|-------|---------|
| **Galería / Cámara** | Añadir imagen de fondo |
| **Editar / Quitar** | Solo si hay imagen |
| **Candado** | **Bloquea** o desbloquea el layout (evita mover celdas por error) |
| **Cuadrícula / apps** | Alterna tamaño de iconos de celda: **grande** o **pequeño** (se recuerda en el dispositivo) |
| **Casa (Home)** | Envía **todas** las celdas del escenario a Home (con confirmación si hay celdas en el plano) |
| **Flecha undo** | **Deshace** el último cambio de posición (hasta **10** pasos) |

Mientras se ejecuta una operación masiva de layout (enviar todo a Home), puede aparecer un indicador de progreso en pantalla.

### 12.5 Bloqueo de layout

Con el **candado cerrado**:

- No puede arrastrar celdas ni enviarlas entre Home y escenario.
- Las herramientas Home y Undo quedan deshabilitadas.

Úselo durante el show para evitar cambios accidentales.

### 12.6 Colores en las celdas (View)

El fondo o borde de la celda refleja el estado (sin MAX activo):

| Estado | Indicación visual |
|--------|-------------------|
| Normal | Gris / estándar |
| **Pre-overload** | Aviso amarillo |
| **Underload** | Alerta (borde rojo) |
| **Overload** | Alerta |
| **Danger** (≥ 130 % overload) | Alerta severa; en modo Stop puede mostrar texto **DANGER** |
| **Tare activa** + TARE global ON | Tono cyan / **NET** |
| **Tr.Err** | Error de transmisión |

---

## 13. Modos List, Prog y Stop

Pulse el **icono de modo** en la cabecera para alternar. El ciclo es: **View → List → Prog → Stop → View**.

### 13.1 List (tabla)

Vista tabular para lectura rápida de muchas celdas.

Columnas habituales: **Id**, **Name**, **Load**, **Battery**, **Underload**, **Overload**, **Maximum**, **Group**, etc.

- Con **MAX** activo, la columna de carga muestra el máximo de sesión.
- Con **LOAD** desactivado, prioriza información de batería donde aplique.
- **Long press** (~0,6 s) sobre una fila: inicia **ZERO** de esa celda (con PRR conectado).

### 13.2 Prog (barras de progreso)

Cada celda se muestra como una **barra vertical** que indica cuánto falta para el overload configurado (100 % = en el límite).

Útil para ver de un vistazo qué celdas se acercan al límite.

- Colores de alarma iguales que en View (pre-overload, overload, danger, underload).
- **Long press** en una celda: **ZERO** individual.

### 13.3 Stop (parada / resumen)

Mosaico de **tarjetas grandes** por celda con el valor actual (o **DANGER** si corresponde).

Pensado para una lectura clara en un momento de parada o revisión.

- **Long press**: **ZERO** individual.

### 13.4 Filtro «mostrar solo grupo»

Si ha activado **Show only this group's LCs** en un grupo (§ 15.2), **List**, **Prog** y **Stop** muestran **solo las celdas de ese grupo**. En **View**, las demás celdas se ocultan del escenario.

---

## 14. Planes de monitor (Monitor Plans)

Un **plan de monitor** define, para el mismo proyecto:

- Qué **grupos** son visibles.
- La **imagen de fondo** y las **posiciones** de las celdas (layout propio por plan).

Cada proyecto tiene al menos el plan **General Plan** (no se puede eliminar).

### 14.1 Abrir el diálogo Plans

En la cabecera de Monitor, pulse el **nombre del plan activo** (junto al título del proyecto).

Se abre el cuadro **Plans** con la lista de planes del proyecto.

### 14.2 Seleccionar un plan

Pulse el **nombre** del plan en la lista. El monitor cambia al layout e imagen guardados para ese plan.

### 14.3 Crear un plan nuevo

1. En **Plans**, pulse **+ New plan**.
2. Indique **Plan Name**.
3. Marque los **grupos incluidos** en el plan.
4. Pulse **Save**.

El plan nuevo queda activo. Coloque imagen y celdas; se guardan **solo en ese plan**.

### 14.4 Editar, renombrar o eliminar

En cada plan (excepto **General Plan**):

| Botón | Acción |
|-------|--------|
| **Edit** | Cambiar grupos incluidos (si quita un grupo, puede resetear posiciones guardadas de sus celdas) |
| **Rename** | Cambiar el nombre |
| **Delete** | Eliminar el plan |

**General Plan** solo se puede **seleccionar**, no editar ni borrar desde estos botones.

### 14.5 Buenas prácticas con planes

- Use **General Plan** como vista completa del montaje.
- Cree planes secundarios para **fases** o **zonas** (p. ej. solo frente, solo grid superior).
- Al cambiar de plan, verifique que el **overload de grupo** sigue siendo válido para los grupos visibles.

---

## 15. Botones y acciones

### 15.1 Interacción con la franja de grupos

| Gesto | Requisito | Acción |
|-------|-----------|--------|
| **Un toque** | — | Activa/desactiva **Show only this group's LCs** (solo ese grupo en pantalla). Segundo toque en el mismo grupo: quita el filtro |
| **Doble toque** (dos toques rápidos) | PRR conectado | Abre **Group Actions** (Tare, Zero, resaltar, mostrar solo) |
| **Pulsación larga** (~0,6 s) | PRR conectado | Abre confirmación de **ZERO de grupo** (doble paso Next) |

Si el grupo tiene celdas duplicadas o no transmitiendo, la app puede mostrar error antes de la acción.

### 15.2 Cuadro Group Actions (doble toque en grupo)

| Control | Función |
|---------|---------|
| **Tare** / **Cancel Tare** | Aplica o cancela **tara de grupo** |
| **Zero** | Pasa al flujo de **ZERO de grupo** (2 confirmaciones) |
| **Highlight LC's** | Resalta con anillo las celdas del grupo en el escenario |
| **Show only this group's LCs** | Oculta el resto de celdas |

**Tare de grupo:** todas las celdas del grupo deben tener peso **> 0**; si no, verá *One or more of your LC's load <= 0*.

### 15.3 Botón TARE en la cabecera

| Función | Detalle |
|---------|---------|
| **Alternar Gross / Net** | Si hay grupos en tara, cambia si las celdas muestran peso bruto o neto |
| **Tare rápida de grupo** | Si un grupo está en modo visual (resaltado o show-only), un toque en **TARE** aplica **Tare** o **Cancel Tare** a **ese** grupo sin abrir el cuadro |

Si no hay grupo seleccionado visualmente: *Select a group first (Highlight or Show only), then press Tare.*

Requiere **PRR conectado**.

### 15.4 ZERO de grupo

1. **Pulsación larga** en el recuadro del grupo, o **Zero** dentro de Group Actions.
2. Lea la advertencia: *Zero is unreversible…*
3. Pulse **Next** dos veces para confirmar.

**Efectos:** redefine cero de todas las celdas del grupo; **PSW** vuelve a 0.

**Bloqueos:**

- Sin PRR: *Please connect your PRR first*
- Si alguna celda del grupo supera **30 % de su capacidad nominal** (carga en sensor): *Zero not allowed* — descargue antes

### 15.5 ZERO de celda individual

En **View**, **List**, **Prog** o **Stop**:

1. **Pulsación larga** (~0,6 s) sobre la celda.
2. Confirme con **Next** dos veces.

Mismas reglas que ZERO de grupo, pero **solo esa celda**. No se permite si la celda está en **Tr.Err** o sin lectura válida.

### 15.6 MAX y LOAD

| Botón | Comportamiento |
|-------|----------------|
| **LOAD** | ON: peso en iconos; OFF: batería |
| **MAX** | ON: valor máximo de la sesión; desactiva MAX también desactiva la dependencia de LOAD forzada |

### 15.7 Lista de warnings (icono ⚠)

Abre el historial de **alarmas de la sesión actual**:

| Columna | Contenido |
|---------|-----------|
| Time | Hora del aviso |
| LC | Celda, grupo o *Total Sum* / *Pre Overload* |
| Value | Peso en el momento |
| Overload / Underload | Límites de referencia |

Puede **limpiar** la lista con el botón correspondiente del cuadro. Los toasts en pantalla son independientes: cerrar un toast no borra necesariamente el historial hasta que se registre ahí.

### 15.8 Export snapshot

1. Pulse el icono **documento** en la cabecera de Monitor.
2. Elija **CSV** o **PDF**.
3. En móvil, use el menú compartir del sistema para guardar o enviar.

El snapshot incluye estado actual de celdas y grupos, PRR, batería, totales y (en PDF) la **cabecera de informe** configurada en Reports. Título del PDF: **Snapshot Report**.

---

## 16. Alarmas y avisos

### 16.1 Tipos de alarma

| Tipo | Cuándo se dispara |
|------|-------------------|
| **UNDERLOAD** | Peso por debajo del underload de la celda |
| **PRE OVERLOAD** | Peso por encima del umbral de pre-overload (% del overload) |
| **OVERLOAD** | Peso por encima del overload (celda o grupo) |
| **DANGER** | Peso ≥ **130 %** del overload configurado |
| **TOTAL OVERLOAD** | Suma Total Sum supera **Total Overload** del proyecto |

### 16.2 Cómo se muestran

| Canal | Comportamiento |
|-------|----------------|
| **Toast en pantalla** | Mensaje rojo con tipo, ID y pesos; permanece hasta que lo cierre |
| **Sonido** | Beep al aparecer una alarma nueva |
| **Color en celda / grupo** | Fondo o borde según gravedad |
| **Total Weight** | Fondo rojo si supera Total Overload |
| **Historial ⚠** | Registro con hora y valores (§ 15.7) |

Al tocar un toast para cerrarlo, la app puede registrar el cierre en el flujo de alarmas.

### 16.3 Tr.Err y alarmas

Con **Tr.Err** (sin transmisión):

- No se evalúan overload/underload sobre esa lectura.
- La celda o grupo puede mostrar **Tr.Err** en lugar de un número.
- **Total Weight** muestra Tr.Err si no hay PRR.

No tome decisiones de carga basadas en celdas en Tr.Err.

### 16.4 Prioridad visual (resumen)

```
Normal  →  Pre-overload (amarillo)  →  Overload  →  Danger (130 %)
                ↓
           Underload (por debajo del mínimo)
```

### 16.5 Qué hacer ante una alarma

1. **Identifique** celda o grupo en el toast o en la franja de grupos.
2. **Reduzca carga** o detenga el movimiento según su procedimiento de rigging.
3. **No haga ZERO** con carga aplicada si el peso supera el 30 % de capacidad.
4. Si la alarma es por **Tr.Err**, compruebe PRR, baterías y alcance antes de continuar.
5. Revise el historial **⚠** al final del incidente para documentación.

---

# Parte V — Conexión al PRR

El **PRR** (receptor portátil Eilon) es el puente entre las celdas de carga (radio) y la tablet (Bluetooth). Esta parte describe cómo **conectar**, **vigilar el enlace** y **operar** con lecturas en vivo.

> **Cuándo conectar:** después de tener el proyecto configurado (Parte III) y, si lo desea, el layout de Monitor preparado (Parte IV). Para **Zero**, **Tare** y pesos en tiempo real, el PRR debe estar conectado.

---

## 17. Connect Device

### 17.1 Abrir la conexión

1. Menú **☰ → Connect Device**.
2. La app **inicia automáticamente** el escaneo Bluetooth del **PRR** (no hace falta pulsar un botón adicional).
3. Aparece el cuadro **Available devices** con la lista de receptores detectados.

También puede abrir Connect Device estando ya en **Monitor**; el escaneo funciona igual.

### 17.2 Requisitos antes del escaneo

| Plataforma | Requisito |
|------------|-----------|
| **iOS / iPadOS** | **Bluetooth** activado. La app puede pedir permiso de Bluetooth la primera vez. |
| **Android** | **Bluetooth** activado y **ubicación / GPS** activados (requisito del sistema para escanear BLE). |

Si Bluetooth está apagado, verá *Please, turn on Bluetooth.*

Si en Android la ubicación está desactivada, aparece un aviso **Location Disabled** con opción **Go to Settings** para abrir los ajustes de ubicación del sistema.

### 17.3 Durante el escaneo

| Elemento en pantalla | Significado |
|----------------------|-------------|
| **Spinner + “Scanning for devices…”** | Escaneo en curso; la lista se **actualiza en vivo** al detectar aparatos |
| **Cancel** | Detiene el escaneo y cierra el cuadro |
| **Nombre del dispositivo** | Nombre anunciado por el PRR (o *Unknown device* si no hay nombre) |
| **ID / dirección** | Identificador BLE del dispositivo (en iOS suele ser un UUID) |
| **RSSI … dBm** | Intensidad de señal (más cercano a 0 = señal más fuerte) |
| **Connect** | Inicia la conexión con ese PRR |

El escaneo continúa hasta que usted pulse **Cancel**, conecte un dispositivo o cierre el cuadro.

> ℹ️ **Consejo:** Acerque la tablet al PRR. Si no aparece ningún dispositivo, compruebe que el PRR esté encendido y vuelva a abrir **Connect Device**.

### 17.4 Conectar un PRR

1. En la lista, pulse **Connect** junto al PRR correcto.
2. La app establece el enlace BLE (puede tardar unos segundos; tiempo máximo de conexión ~20 s).
3. Si la conexión tiene éxito:
   - El cuadro de dispositivos se cierra.
   - En **Monitor**, el icono Bluetooth pasa a **conectado**.
   - Aparece el **nombre del PRR** y el **porcentaje de batería** del receptor en la cabecera.

### 17.5 Hasta 2 PRR simultáneos

La app permite conectar **como máximo 2 PRR** a la vez.

- Si ya hay 2 enlaces activos e intenta un tercero, verá: *You can connect up to 2 PRRs at the same time.*
- En la cabecera de Monitor se muestran **ambos** nombres con su batería, uno al lado del otro.

Use dos PRR solo cuando su montaje lo requiera; en la mayoría de casos basta **un** receptor.

### 17.6 Errores frecuentes al conectar

| Mensaje / situación | Qué hacer |
|---------------------|-----------|
| *There is already a Bluetooth scan in progress* | Espere o cierre el cuadro anterior de escaneo |
| *Bluetooth scan failed* | Reinicie Bluetooth, acérquese al PRR y reintente |
| *No devices found. Move closer and try again.* | Encienda el PRR, reduzca distancia e interferencias |
| Conexión que no completa | Apague y encienda el PRR; cierre otras apps que usen BLE; reintente |

### 17.7 Desconectar manualmente

Desde **Monitor**, en la cabecera:

1. Pulse el **nombre del PRR** o su icono de **batería**.
2. Confirme **Disconnect** en el cuadro de confirmación.

La desconexión manual **no** activa reconexión automática (véase § 18.4).

---

## 18. Operación con PRR conectado

### 18.1 Lecturas en vivo

Con el PRR conectado y las celdas transmitiendo:

| Dónde | Qué verá |
|-------|----------|
| **Iconos de celda** (View) | Peso actual (o batería si LOAD está desactivado) |
| **Franja de grupos** | Suma de peso por grupo |
| **Total Weight** | Suma de celdas en **Total Sum** |
| **List / Prog / Stop** | Valores actualizados por celda |

Los pesos se refrescan automáticamente al llegar paquetes del PRR.

### 18.2 Tr.Err justo después de conectar

Es **normal** que, al conectar un PRR, las celdas muestren brevemente **Tr.Err**:

1. Al establecer el enlace, la app **reinicia** el estado de frescura de cada celda.
2. Cada celda pasa a lectura válida cuando recibe su **primer paquete nuevo** del PRR.

Espere unos segundos. Si **Tr.Err** persiste en una celda concreta, compruebe que esa LC esté encendida y en alcance del PRR.

### 18.3 Pérdida de señal y Tr.Err durante el monitoreo

La app vigila la **frescura** de los datos:

| Situación | Comportamiento |
|-----------|----------------|
| Una celda deja de enviar datos (~2 s sin muestra nueva) | Esa celda pasa a **Tr.Err** |
| Todo el enlace deja de recibir datos (~4 s sin actividad global) | **Todas** las celdas pueden pasar a **Tr.Err** |
| Vuelven los paquetes | Las lecturas se restauran automáticamente |

### 18.4 Reconexión automática

Si el enlace BLE se **pierde sin que usted desconecte** (PRR fuera de alcance, batería baja, interferencia), la app intenta **reconectar automáticamente** al mismo PRR:

- Reintentos con espera creciente (desde ~1,5 s hasta un máximo de ~30 s entre intentos).
- Si usted abre **Connect Device** o conecta manualmente otro aparato, la reconexión automática en curso se **cancela** a favor de su acción manual.

Si **desconecta usted** desde Monitor (§ 17.7), **no** hay reconexión automática.

### 18.5 Batería del PRR

En la cabecera de Monitor, junto al nombre de cada PRR conectado:

- Icono de **batería** con **porcentaje**.
- Pulse el nombre o la batería para **desconectar** ese PRR.

Mantenga el PRR cargado; un PRR con batería baja puede provocar cortes de enlace y **Tr.Err**.

### 18.6 Batería de las celdas

Active el botón **LOAD** (icono de carga) en la cabecera de Monitor para alternar entre **peso** y **porcentaje de batería** en cada icono de celda.

Revise las baterías de las LCs antes y durante el evento (checklist § 10.2, punto 7).

### 18.7 Zero y Tare con PRR conectado

| Acción | Requisito |
|--------|-----------|
| **ZERO** (grupo o celda) | PRR conectado y lectura válida (no Tr.Err en la celda objetivo) |
| **TARE** de grupo (barra o Group Actions) | PRR conectado |
| **Doble toque** en grupo (Group Actions) | PRR conectado |

Sin PRR verá: *Please connect your PRR first*.

Siempre haga **ZERO con las celdas descargadas** y antes de aplicar la carga de trabajo (véase Parte IV, § 15.4 y § 15.5).

### 18.8 Operación en segundo plano

La app está preparada para mantener el enlace BLE durante el monitoreo, incluidos periodos en que la app pasa a **segundo plano** (según permisos de Bluetooth en iOS).

Buenas prácticas:

- No fuerce el cierre de la app durante un show activo.
- Mantenga la tablet **cargada** y con Bluetooth activo.
- Tras un corte prolongado, compruebe en Monitor que el icono PRR sigue **conectado** y que los pesos se actualizan.

### 18.9 Secuencia operativa típica con PRR

```
1. PRR encendido + celdas encendidas
2. ☰ → Connect Device → Connect (PRR correcto)
3. Esperar fin de Tr.Err inicial en las celdas
4. ZERO (grupo o celdas, sin carga)
5. Monitorear pesos y alarmas
6. Al terminar: desconectar PRR desde la cabecera (opcional)
```

### 18.10 Relación con reportes históricos

La conexión PRR alimenta el **monitoreo en vivo**. El **registro histórico** para **Reports** depende además de tener **Reports Cycle** activado en More Settings (Parte VI).

Los eventos de enlace PRR (conectado / desconectado) pueden registrarse en el histórico cuando el ciclo de reportes está activo.

---

# Parte VI — Reportes

El módulo **Reports** consulta el **histórico de lecturas** guardadas en el dispositivo mientras el monitoreo estaba activo con **Reports Cycle** encendido (véase § 7.5).

---

## 19. Reports

### 19.1 Abrir Reports

1. Menú **☰ → Reports**.
2. Se abre la pantalla de reportes con dos zonas:
   - **Izquierda:** lista **My Projects** y barra de **Storage**.
   - **Derecha:** filtros, tabla y exportación.

Al entrar, la app **no carga datos automáticamente**. Debe pulsar **Refresh** para consultar el histórico.

### 19.2 Requisito: Reports Cycle activado

El histórico solo se graba si en **More Settings** del proyecto tiene activado **Reports Cycle** y un **Report interval** definido (Parte III, § 7.5).

Si intenta cargar un proyecto con el ciclo **desactivado**, verá:

- *Reports Cycle is disabled*
- *Reports are not available. Please enable Reports Cycle in project settings to view reports.*

Active el ciclo, guarde More Settings y vuelva a Monitor para que empiecen a registrarse muestras.

### 19.3 Seleccionar proyecto

En **My Projects**, pulse el nombre del proyecto cuyo histórico desea consultar.

- El proyecto seleccionado queda resaltado con borde azul.
- Por defecto suele aparecer el **proyecto activo** en Monitor; puede cambiar a otro de la lista.

Arriba de los filtros verá: *Showing reports for: **Nombre del proyecto***.

### 19.4 Barra de almacenamiento (Storage)

En la columna izquierda, el bloque **Storage** muestra el uso de espacio en el dispositivo:

| Segmento | Significado |
|----------|-------------|
| Gris | Otros datos del sistema / apps |
| Azul (primary) | Datos de reportes de la app |
| Texto **Free** | Espacio libre |

Si queda **menos del 10 %** libre, aparece un aviso: la app puede **eliminar automáticamente** los registros de reporte más antiguos al guardar datos nuevos.

### 19.5 Filtros

#### Estados (toggles)

Puede incluir o excluir filas según el estado de cada lectura:

| Toggle | Incluye |
|--------|---------|
| **Ok** | Lecturas normales |
| **Overload** | Sobrecarga |
| **Danger** | Peligro (≥ 130 % del overload) |
| **Underload** | Bajo el umbral inferior |
| **Tr.Err** | Error de transmisión |

Todos vienen **activados** por defecto. Desactive los que no quiera ver.

> ℹ️ Al cambiar cualquier filtro, aparece el aviso *Filters changed. Press Refresh to apply.* — los datos en pantalla **no** se actualizan solos.

#### Rango de fechas

| Campo | Función |
|-------|---------|
| **From** | Fecha inicial (inclusive) |
| **To** | Fecha final (inclusive) |

Por defecto suele mostrar el **día actual**.

#### Rango horario (solo un día)

Si **From** y **To** son el **mismo día**, puede restringir además por hora:

| Campo | Función |
|-------|---------|
| **Hour from** | Hora inicial (p. ej. 08:00) |
| **Hour to** | Hora final (p. ej. 18:00) |

Si el rango abarca **varios días**, los campos de hora quedan **deshabilitados**.

#### Límite de carga

La app puede cargar hasta **300 000** registros para pantalla y exportación. Si hay más coincidencias, muestra las **más recientes** y avisa que acorte el rango o los filtros.

### 19.6 Cargar el reporte (Refresh)

1. Configure proyecto, fechas, hora (si aplica) y toggles de estado.
2. Pulse el botón **Refresh** (icono circular azul).

Durante la carga verá un indicador de progreso (*Loading report…*). Puede pulsar **Cancel** para abortar.

Si no hay datos para los filtros elegidos:

*No reports found for the selected date range and filters. Check status toggles (OK / Overload / Danger / Underload / Tr.Err).*

### 19.7 Tabla de resultados

Los datos se agrupan en **intervalos de tiempo** según el **Report interval** del proyecto (p. ej. cada 60 segundos).

Cada bloque de la tabla lleva una **cabecera azul** con la marca de tiempo del intervalo (p. ej. `2026-06-16 14:30:00`).

Columnas de cada fila:

| Columna | Contenido |
|---------|-----------|
| **Title** | Nombre de la celda, o *PRR connected* / *PRR disconnected* |
| **ID** | ID de la celda, o nombre del PRR en eventos de enlace |
| **Status** | OK, OVERLOAD, DANGER, UNDERLOAD, TR.ERR, etc. |
| **Gross** | Peso bruto |
| **Net** | Peso neto (si aplica tara en el registro) |
| **Battery** | Batería de la celda |
| **Time** | Fecha y hora exacta de la muestra |

#### Paginación

La tabla muestra **10 intervalos por página**. Use **‹** y **›** al pie para cambiar de página.

### 19.8 Eliminar registros

El botón **Delete** (papelera roja) elimina **solo** las filas que coinciden con:

- Proyecto seleccionado
- Rango de fechas (y horas, si aplica)
- Estados activos en los toggles

1. Pulse **Delete**.
2. Confirme en el cuadro: *Delete only logs matching current project + date/status/hour filters?*

⚠️ **Advertencia:** La eliminación es **irreversible**.

Tras borrar, pulse **Refresh** para actualizar la vista.

### 19.9 Exportar reporte

Primero debe **cargar** el reporte con **Refresh**. Luego use la fila **Export:**

| Formato | Uso |
|---------|-----|
| **CSV** | Hoja de cálculo, análisis completo, archivos grandes |
| **PDF** | Informe imprimible con cabecera de marca |

En **móvil** (iOS/Android), al exportar se abre el menú **compartir** del sistema para guardar o enviar el archivo.

#### Contenido del CSV

- Líneas iniciales con **metadatos** (proyecto, artista, ciudad, usuario, web, rango de fechas, etc.).
- El **logo** no se incrusta en CSV; en metadatos puede indicar que el logo va solo en PDF.
- Filas: Name, ID, Status, Gross, Net, Battery, Time.

#### Contenido del PDF

- Título del documento: **Report**.
- **Cabecera** con logo (si está configurado), datos del proyecto y código **QR** (opcional).
- Tabla con las mismas columnas que en pantalla.
- En PDF nativo muy grande, puede exportar solo las **primeras 1 500** filas; use **CSV** para el histórico completo.

Si exporta sin haber cargado antes: *No data to export. Load a report first.*

### 19.10 Configurar cabecera del informe (Report header)

Pulse **Report header** (icono de lápiz) para abrir **Report header & branding**:

| Campo | Descripción |
|-------|-------------|
| **Project** | Nombre del proyecto (solo lectura) |
| **Artist** | Artista / espectáculo |
| **City** | Ciudad |
| **User** | Usuario o responsable |
| **Website** | URL (clicable en PDF si es válida) |
| **Include QR code** | Toggle para código QR con el enlace web |
| **Company logo** | Galería o cámara; **Clear** para quitar |

Pulse **Save** para guardar. La configuración se usa en exportaciones **CSV**, **PDF** de Reports y en el **Snapshot** de Monitor.

### 19.11 Flujo de trabajo típico

```
1. More Settings → Reports Cycle ON + intervalo (p. ej. 60 s)
2. Monitor + PRR conectado durante el evento
3. ☰ → Reports
4. Elegir proyecto → From / To → toggles de estado
5. Refresh
6. Revisar tabla → Export CSV o PDF (opcional: Report header)
```

### 19.12 Relación con Snapshot de Monitor

| Origen | Qué captura |
|--------|-------------|
| **Reports** | Histórico en el tiempo (mientras Reports Cycle está activo) |
| **Snapshot** (Monitor, icono documento) | Instantánea **en el momento actual** de todas las celdas |

Ambos pueden usar la misma **cabecera de informe** (Report header). El PDF de snapshot se titula **Snapshot Report**.

---

# Parte VII — Resolución de problemas y buenas prácticas

Esta parte recopila los **mensajes de error más habituales**, la **secuencia operativa en obra** y respuestas a **preguntas frecuentes**. Para el detalle de cada módulo, consulte las Partes III a VI.

---

## 20. Errores frecuentes

Los mensajes citados aparecen en **inglés** en la interfaz por defecto. La columna **Qué hacer** indica la acción correctiva.

### 20.1 No puedo abrir Monitor

| Mensaje (aprox.) | Causa | Qué hacer |
|------------------|-------|-----------|
| *At least 1 LC must be total sum mode* | Ninguna celda tiene activado **Total Sum** | Settings → marque **Total Sum** en al menos una LC (§ 8.4) |
| *You Must First set at Least One Group* | No hay grupos con overload definido | Settings → cree un grupo y asigne **overload** > 0 (§ 9) |
| *{Nombre del grupo} Can't be 0* | Un grupo tiene overload **0** | Settings → edite el grupo y ponga un overload válido |
| *(Sin proyecto)* → cuadro **Create New Project** | No hay proyecto activo | Projects → cree o seleccione un proyecto (§ 6) |

> ℹ️ **Total Overload** y **Pre-overload** en 0 se validan al guardar More Settings o al operar alarmas; si faltan, corrija en **More Settings** (§ 7.3–7.4).

### 20.2 Errores en Settings (celdas y grupos)

| Mensaje | Causa | Qué hacer |
|---------|-------|-----------|
| *Invalid unit id {ID}* | El ID de celda **no existe** en la tabla de capacidades | Compruebe la etiqueta física del LC; use un ID válido (Apéndice A) |
| *Overload must be bigger than 0* | Overload de grupo vacío o cero | Introduzca un valor > 0 al guardar el grupo |
| *Overload can't be higher than capacity* | Overload de LC mayor que la capacidad nominal del ID | Reduzca el overload o verifique que el ID sea el correcto |
| *Underload can't be higher than Overload* | Underload ≥ overload en la LC | Ajuste underload por debajo del overload |
| *P.S.W can't be negative* | Valor PSW negativo al editar LC | Corrija el campo PSW |
| *Cannot create new load cells while an overload or underload alert is active…* | Hay una alarma activa en Monitor | Cierre o resuelva la alarma; luego vuelva a Settings |
| *Total overload can't be 0. Please set it first* | Total Overload no configurado | More Settings → **Total Overload** > 0 |
| *Preoverload can't be 0. Please set it first* | Pre-overload no configurado | More Settings → **Pre-overload Warning** > 0 |

### 20.3 Conexión PRR y Bluetooth

| Mensaje / síntoma | Causa probable | Qué hacer |
|-------------------|----------------|-----------|
| *Please, turn on Bluetooth.* | Bluetooth del dispositivo apagado | Active Bluetooth en ajustes del sistema |
| **Location Disabled** (Android) | GPS / ubicación apagados | Active ubicación; en el aviso pulse **Go to Settings** |
| *Scanning for devices…* sin resultados | PRR apagado, fuera de alcance o interferencias | Encienda el PRR, acérquese, pulse **Connect** de nuevo tras cerrar y reabrir el cuadro |
| *No devices found. Move closer and try again.* | Mismo caso tras escaneo | Verifique batería del PRR y que no esté conectado solo a otro dispositivo |
| *Bluetooth scan failed.* | Error del sistema al escanear | Reinicie Bluetooth; cierre otras apps que usen BLE; reintente |
| *Please connect your PRR first* | Acción que requiere PRR (Zero, Tare, etc.) sin enlace activo | ☰ → **Connect Device** → **Connect** |
| Icono BLE **desconectado** en Monitor | Sin enlace BLE activo | Conecte el PRR; compruebe que no lo desconectó manualmente |
| Tr.Err en **todas** las celdas tras conectar | Normal al inicio; o pérdida total de enlace | Espere unos segundos a que lleguen muestras; si persiste, § 20.4 |

### 20.4 Tr.Err (error de transmisión)

**Tr.Err** indica que la app **no recibe una lectura válida** de esa celda en ese momento.

| Situación | Causas habituales | Qué hacer |
|-----------|-------------------|-----------|
| Tr.Err en **una** celda | Celda apagada, batería baja, fuera de alcance del PRR, ID no configurado en el proyecto | Verifique encendido, batería (icono en Monitor con **LOAD** ON), ID en Settings |
| Tr.Err en **varias** celdas | Alcance, obstáculos, interferencias de radio | Acerque PRR o celdas; reduzca obstáculos metálicos |
| Tr.Err en **todas** las celdas | PRR desconectado, apagado o sin datos BLE | Reconecte PRR; la app intenta **reconexión automática** salvo desconexión manual |
| Tr.Err **intermitente** | Límite de cobertura o muchas celdas en el mismo PRR | Mejore posición del PRR; compruebe baterías |
| Tr.Err tras **volver** a la app | La app estuvo en segundo plano | Espere a que se restablezca el enlace; reconecte si hace falta |

> ℹ️ Con Tr.Err **no** se evalúan alarmas de overload/underload en esa celda (§ 16.3). No use ese peso para decisiones de carga.

Al **conectar** un PRR, las celdas pueden mostrar Tr.Err brevemente hasta recibir la primera ronda de datos.

### 20.5 Zero y Tare

| Mensaje / síntoma | Causa | Qué hacer |
|-------------------|-------|-----------|
| *Cannot apply ZERO… above 30% of capacity* | Carga en el sensor > 30 % de capacidad nominal | Descargue la celda o el grupo antes de Zero |
| *Zero failed.* / error al aplicar Zero | PRR no conectado, Tr.Err o fallo de comunicación | Conecte PRR; espere lectura válida; reintente |
| *Select a group first (Highlight or Show only), then press Tare.* | Tare rápido sin grupo seleccionado visualmente | Toque el nombre del grupo (resaltar o show-only) y pulse **TARE** |
| *One or more of your LC's load <= 0* | Tare con lecturas no válidas para tara | Compruebe PRR y pesos antes de tara |
| Peso neto inesperado tras Tare | Grupo en modo tara (NET) | Pulse **TARE** de nuevo para **Cancel Tare** o revise § 15.3 |

### 20.6 Reportes

| Mensaje / síntoma | Causa | Qué hacer |
|-------------------|-------|-----------|
| *Reports Cycle is disabled* | Ciclo de reportes apagado | More Settings → active **Reports Cycle** (§ 7.5) |
| *No reports found for the selected date range…* | Sin datos en el rango o filtros de estado muy restrictivos | Amplíe fechas; active toggles OK / Overload / etc.; pulse **Refresh** |
| *Filters changed. Press Refresh to apply.* | Cambió filtros sin recargar | Pulse **Refresh** |
| *No data to export. Load a report first.* | Export sin haber cargado datos | **Refresh** antes de CSV/PDF |
| Tabla vacía tras Refresh | No hubo monitoreo con Reports Cycle ON en esas fechas | Verifique que Monitor estuvo activo con PRR y ciclo encendido |
| Aviso de **300 000** registros | Demasiados logs para el rango | Acorte fechas o filtros |
| PDF solo **1 500** filas en móvil | Límite de exportación nativa | Use **CSV** para el histórico completo (§ 19.9) |
| Barra **Storage** con poco espacio libre | Disco del dispositivo casi lleno | Libere espacio; exporte y borre reportes antiguos si procede (§ 19.4, 19.8) |

### 20.7 Proyectos (importar / exportar)

| Mensaje | Causa | Qué hacer |
|---------|-------|-----------|
| *Failed to export project.* | Error al generar o compartir el CSV | Reintente; compruebe espacio en disco |
| *Failed to import project. Check CSV format.* | CSV dañado o de otra versión | Use un CSV exportado por esta app; revise Apéndice B |
| Proyecto importado sin imagen de fondo | Campo `p_image` muy grande o truncado | Vuelva a asignar imagen en More Settings si hace falta |

### 20.8 Resumen rápido por síntoma

```
Sin pesos en Monitor     → PRR conectado + celdas ON + IDs correctos en Settings
Tr.Err persistente       → Alcance / batería / reconexión PRR
No abre Monitor          → Total Sum + grupo con overload + proyecto activo
Sin histórico Reports    → Reports Cycle ON durante el evento + Refresh
Zero bloqueado           → Descargar por debajo del 30 % de capacidad
```

---

## 21. Secuencia recomendada en obra

Checklist operativo de un montaje desde cero. Coincide con el flujo de las Partes I–VI.

### 21.1 Antes del día del montaje

| Paso | Acción | Referencia |
|------|--------|------------|
| 1 | Crear o **duplicar** un proyecto de referencia | § 6 |
| 2 | Configurar **Total Overload**, **Pre-overload** y unidades | § 7.3–7.4 |
| 3 | Dar de alta **LCs** con IDs correctos; marcar **Total Sum** en al menos una | § 8 |
| 4 | Crear **grupos** y definir **overload** de cada uno | § 9 |
| 5 | (Opcional) Ajustar imagen de fondo y **planes de monitor** | § 12.3, § 14 |
| 6 | **Exportar** el proyecto (CSV) como respaldo | § 6.5 |
| 7 | Activar **Reports Cycle** e intervalo si necesita histórico | § 7.5 |
| 8 | Configurar **Report header** (logo, artista, etc.) si va a exportar informes | § 19.10 |

### 21.2 En el lugar de trabajo — inicio

| Paso | Acción |
|------|--------|
| 1 | Encender **celdas** y **PRR**; comprobar baterías |
| 2 | Abrir la app → seleccionar **proyecto** |
| 3 | Revisar **Settings** si hubo cambios de última hora |
| 4 | Abrir **Monitor** → comprobar layout (modo **View**) |
| 5 | ☰ → **Connect Device** → conectar **PRR** (hasta 2 si aplica) |
| 6 | Verificar checklist **Before You Start** (§ 10.2) |
| 7 | Con celdas **descargadas**, aplicar **ZERO** (grupo o individual) |
| 8 | Comprobar unidades con **Units: …** en cabecera |

### 21.3 Durante el monitoreo

| Paso | Acción |
|------|--------|
| 1 | Vigilar **Total Weight**, grupos y alarmas (toast + historial ⚠) |
| 2 | Usar **TARE** solo según procedimiento de rigging acordado |
| 3 | Ante **OVERLOAD** o **DANGER**, actuar según protocolo de obra |
| 4 | Si aparece **Tr.Err**, no decidir carga hasta recuperar lectura |
| 5 | (Opcional) **Snapshot** CSV/PDF para documentar un instante |
| 6 | Mantener tablet y PRR con **batería** suficiente |

### 21.4 Al finalizar o entre jornadas

| Paso | Acción |
|------|--------|
| 1 | ☰ → **Reports** → rango de fechas → **Refresh** |
| 2 | **Export** CSV y/o PDF del histórico si se requiere |
| 3 | (Opcional) **Delete** de logs antiguos para liberar espacio |
| 4 | **Export** del proyecto si hubo cambios de configuración |
| 5 | Desconectar PRR si no seguirá monitoreando |

### 21.5 Diagrama de flujo

```
Projects ──► More Settings ──► Settings (LCs + grupos)
                                    │
                                    ▼
                              Monitor (layout)
                                    │
                                    ▼
                           Connect Device (PRR)
                                    │
                                    ▼
                              ZERO → operar
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
              Snapshot (instante)              Reports (histórico)
```

---

## 22. FAQ — Preguntas frecuentes

### 22.1 General

**¿Puedo usar la app sin Internet?**  
Sí. La configuración, Monitor, conexión PRR y reportes funcionan **sin conexión a Internet**. Los datos se guardan en el dispositivo.

**¿Necesito iniciar sesión?**  
No para el uso operativo descrito en este manual. El trabajo se organiza por **proyectos locales** en el dispositivo.

**¿En qué orientación debo usar la tablet?**  
En **horizontal (apaisada)**. Monitor y el layout están optimizados para esa orientación (§ 3.1).

### 22.2 Proyectos y configuración

**¿Puedo copiar un montaje anterior?**  
Sí. **Projects → Duplicate** crea una copia del proyecto con celdas, grupos y ajustes (§ 6.3).

**¿Cómo paso un proyecto a otra tablet?**  
**Export** CSV en un dispositivo e **Import** en el otro (§ 6.5). El histórico de Reports **no** viaja en ese CSV; expórtelo aparte desde Reports.

**¿Por qué la app exige Total Sum?**  
Al menos una LC en **Total Sum** alimenta el **Total Weight** del encabezado y las alarmas de **Total Overload** del proyecto.

**¿Puedo cambiar las unidades durante el evento?**  
Sí, pulsando **Units: …** en la cabecera de Monitor. Los overloads guardados se interpretan en la unidad del proyecto; cambie con cuidado si hay alarmas activas.

### 22.3 Monitor y PRR

**¿Puedo preparar el layout sin conectar el PRR?**  
Sí. Puede abrir Monitor y colocar celdas en **View** antes de conectar. No habrá pesos en vivo hasta conectar el PRR.

**¿Cuántos PRR puedo conectar?**  
Hasta **2** receptores simultáneos (§ 17.5).

**¿La app reconecta sola si pierdo el PRR?**  
Sí, intenta **reconexión automática**, salvo que haya desconectado manualmente desde Connect Device.

**¿Qué significa PSW?**  
Peso acumulado de referencia interna de la celda. **ZERO** lo reinicia a cero (§ 5.2).

**¿Zero y Tare son lo mismo?**  
No. **ZERO** redefine el cero del sensor (irreversible en la sesión). **TARE** resta el peso del aparejo del grupo para mostrar **neto** (§ 5.2, § 15.3).

### 22.4 Alarmas y seguridad

**¿Cuándo aparece DANGER frente a OVERLOAD?**  
**DANGER** cuando el peso alcanza **≥ 130 %** del overload configurado (§ 16.1).

**¿Puedo silenciar una alarma?**  
Puede **cerrar el toast** tocándolo; el historial ⚠ conserva el registro. Debe **reducir la carga** según su procedimiento de seguridad.

### 22.5 Reportes

**¿Por qué no hay datos en Reports?**  
Compruebe: (1) **Reports Cycle** activo durante el monitoreo, (2) proyecto correcto seleccionado, (3) rango de fechas adecuado, (4) pulsó **Refresh**, (5) toggles de estado no excluyen todas las filas.

**¿Cuál es la diferencia entre Reports y Snapshot?**  
**Reports** = histórico en el tiempo (con Reports Cycle). **Snapshot** = foto del estado **actual** en Monitor (§ 19.12).

**¿Por qué el PDF de Reports tiene menos filas que el CSV?**  
En iOS/Android el PDF nativo puede limitarse a **1 500** filas; el CSV incluye el conjunto cargado (hasta 300 000).

### 22.6 Datos y almacenamiento

**¿Dónde se guardan mis datos?**  
En el **almacenamiento local** del dispositivo (base de datos interna de la app). Haga **exportaciones periódicas** como respaldo.

**¿La app borra reportes antiguos sola?**  
Si el espacio libre del dispositivo baja mucho (&lt; 10 %), la app puede **purgar registros antiguos** al guardar datos nuevos (§ 19.4).

---

# Apéndices

---

## Apéndice A — Capacidades por ID de celda

Al introducir el **ID numérico** de una celda en Settings, la app asigna automáticamente la **capacidad nominal** según la tabla interna `LC_Serials`. Si el ID no aparece en ningún rango, verá *Invalid unit id*.

Los valores de **overload** de celda y grupo no deben superar la capacidad nominal (en la unidad del proyecto).

### A.1 Tabla de rangos y capacidades

| Rango de ID | M.TON | KG | LBS |
|-------------|-------|-----|------|
| 1 – 10 | 0,25 | 250 | 551,25 |
| 250 – 499 | 0,25 | 250 | 551,25 |
| 500 – 999 | 0,5 | 500 | 1 102,5 |
| 1 000 – 1 499 | 1 | 1 000 | 2 205 |
| 1 500 – 1 999 | 1,5 | 1 500 | 3 307,5 |
| 2 000 – 2 499 | 2 | 2 000 | 4 410 |
| 2 500 – 2 999 | 2,5 | 2 500 | 5 512,5 |
| 3 000 – 3 999 | 3 | 3 000 | 6 615 |
| 4 000 – 4 999 | 4 | 4 000 | 8 820 |
| 5 000 – 5 999 | 5 | 5 000 | 11 025 |
| 6 000 – 6 999 | 6 | 6 000 | 13 230 |
| 7 000 – 7 499 | 8 | 8 000 | 17 640 |
| 7 500 – 7 999 | 10 | 10 000 | 22 050 |
| 8 000 – 8 499 | 12,5 | 12 000 | 27 558 |
| 8 500 – 8 999 | 15 | 15 000 | 33 075 |
| 9 000 – 9 249 | 20 | 20 000 | 44 100 |
| 9 250 – 9 499 | 25 | 25 000 | 55 125 |
| 9 500 – 9 999 | 30 | 30 000 | 66 150 |
| 10 000 – 10 249 | 40 | 40 000 | 88 200 |
| 10 250 – 10 499 | 50 | 50 000 | 110 250 |
| 10 500 – 10 599 | 80 | 80 000 | 176 400 |
| 10 600 – 10 699 | 125 | 125 000 | 275 625 |
| 10 700 – 10 799 | 200 | 200 000 | 441 000 |
| 10 800 – 10 899 | 250 | 250 000 | 551 250 |
| 10 900 – 10 999 | 300 | 300 000 | 661 500 |

### A.2 Rangos alternativos (misma capacidad)

Algunos IDs altos comparten capacidad con rangos estándar:

| Rango alternativo | Equivalente a |
|-------------------|---------------|
| 11 000 – 11 899 | 1 000 – 1 499 (1 M.TON / 1 000 KG) |
| 11 900 – 12 799 | 1 500 – 1 999 (1,5 M.TON) |
| 12 800 – 13 699 | 2 000 – 2 499 (2 M.TON) |
| 13 700 – 14 599 | 2 500 – 2 999 (2,5 M.TON) |
| 14 600 – 14 999 | 3 000 – 3 999 (3 M.TON) |
| 15 000 – 15 399 | 4 000 – 4 999 (4 M.TON) |
| 15 400 – 15 799 | 5 000 – 5 999 (5 M.TON) |
| 15 800 – 16 000 | 6 000 – 6 999 (6 M.TON) |

### A.3 Notas

- Los IDs **1 – 10** corresponden a celdas de tipo velocidad/capacidad reducida en la tabla; el uso en Monitor sigue las mismas reglas de overload.
- La **resolución** de visualización (decimales del peso) también depende del rango de ID; la app la aplica automáticamente.
- Si el ID físico de la celda no coincide con la fila de la tabla, corrija el ID en Settings o sustituya la celda según documentación del fabricante.

---

## Apéndice B — Estructura de archivos exportados

### B.1 Exportación de proyecto (CSV)

**Origen:** Projects → **Export**  
**Nombre típico:** `project_backup_{nombre}_{fecha}.csv`  
**Codificación:** UTF-8 con BOM (`\uFEFF`)

El archivo está dividido en **secciones** entre corchetes:

| Sección | Contenido |
|---------|-----------|
| `[Project]` | Datos del proyecto: título, unidades, total/pre-overload, ciclo de reportes, imagen de fondo (`p_image` en base64), etc. |
| `[Groups]` | Grupos: id, título, overload, estado de tara |
| `[LoadCells]` | Celdas: id, título, PSW, overload, underload, grupos, posición en View, zero, tare, total_sum, capacity (JSON) |
| `[MonitorPlans]` | Planes de monitor: nombre, grupos incluidos, imagen por plan |
| `[MonitorPlanLayouts]` | Posición de cada LC por plan (`view_x`, `view_y`) |
| `[MonitorPlanState]` | Plan seleccionado actualmente |

> ℹ️ Este CSV **no incluye** el histórico de Reports. Para respaldar lecturas históricas, exporte desde **Reports**.

### B.2 Exportación de Reports (CSV)

**Origen:** Reports → **Export → CSV**  
**Nombre típico:** `report_{fecha}.csv`

Estructura:

1. **Cabecera de metadatos** (líneas `# Report`, Project, Artist, City, User, Website, Range, Generated).
2. **Tabla de datos:** columnas `Name, ID, Status, Gross, Net, Battery, Time`.
3. Filas agrupadas por intervalos de tiempo (según **Report interval** del proyecto).
4. Eventos de enlace PRR como filas *PRR connected* / *PRR disconnected*.

### B.3 Exportación de Reports (PDF)

**Título del documento:** **Report**  
Incluye cabecera con logo (si está configurado), metadatos del proyecto, código QR opcional y tabla de lecturas. En móvil, máximo **1 500** filas por PDF.

### B.4 Snapshot de Monitor (CSV / PDF)

**Origen:** Monitor → icono documento → CSV o PDF  
**Título PDF:** **Snapshot Report**

**CSV — orden aproximado:**

1. Cabecera de branding (igual que Reports).
2. Línea `PRR` con ID, estado y batería.
3. Línea `Total Sum` con peso dual KG/LBS.
4. Tabla de todas las LCs: `#, Name, ID, Status, Gross, Net, Battery, Time`.
5. Bloques por **grupo** con total dual y subtabla de celdas.

**PDF:** mismos datos en formato imprimible con cabecera de informe.

### B.5 Convenciones comunes

| Aspecto | Detalle |
|---------|---------|
| Separador | Coma (`,`) |
| Texto con comas | Entre comillas dobles (`"..."`) |
| Peso dual | Líneas separadas KG y LBS en snapshot y totales de grupo |
| Tr.Err | Aparece literalmente en columnas Gross/Net cuando no hay lectura válida |
| Fechas | `yyyy-MM-dd HH:mm` o `yyyy-MM-dd HH:mm:ss` según exportación |

---

## Apéndice C — Contacto y soporte

### C.1 Antes de contactar soporte

Recopile esta información:

| Dato | Dónde obtenerlo |
|------|-----------------|
| **Versión de la app** | Menú ☰, parte inferior: p. ej. `version-1.5.0` |
| **Modelo y SO del dispositivo** | Ajustes del sistema (iPad, Android, versión iOS/Android) |
| **Nombre del proyecto** | Cabecera de Monitor o Projects |
| **Descripción del problema** | Mensaje exacto en pantalla, captura si es posible |
| **Momento del fallo** | Al conectar PRR, en Zero, en Reports, etc. |

### C.2 Materiales útiles para soporte

1. **Export CSV del proyecto** (Projects → Export) — configuración actual.
2. **Export CSV/PDF de Reports** — si el problema es histórico o alarmas pasadas.
3. **Snapshot** de Monitor — si el problema es una lectura en un instante concreto.

### C.3 Fabricante

**Eilon Engineering**  
Ron Stage Master (EilonRonStage) es un producto de software de Eilon Engineering para monitoreo de celdas de carga con receptor PRR.

Para **soporte técnico**, **formación** o **incidencias de hardware** (celdas, PRR), contacte con su **distribuidor Eilon** o el **canal de soporte** que le haya proporcionado la instalación de la aplicación.

> ℹ️ Mantenga este manual (`MANUAL_USUARIO.md`) junto con la versión de la app instalada. Si actualiza la aplicación, compruebe si existe una revisión del manual acorde a la nueva versión.

---

*Fin del manual de usuario — Ron Stage Master v1.0*
