# Estudiador
Página web de estudio con algoritmo de estudio, pomodoro, organizador de repasos, estadísticas...

## Ideas

- Un LLM podría pasar un json con las relaciones entre tarjetas, por ejemplo de un tema entero. El problema es que los gratuitos de api suelen alucinar o cometer errores de sintaxis, podríamos admitir csv que es más simple o fallbacks: Que el usuario u otro LLM inspeccione el archivo.

- Con estas relaciones, se podrían etiquetar con "relacionado", "implica", etc y que cada una de estas relaciones tenga un peso asociado y, en las simulaciones de montecarlo tenerlas en cuenta para que cuenten todos los conceptos relacionados al preguntado, por ejemplo todas las anteriores que expliquen o impliquen la preguntada.
