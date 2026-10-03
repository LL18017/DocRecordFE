@AGENTS.md

# Convenciones de este repositorio

## Los commits no llevan atribución de herramientas

Ningún mensaje de commit lleva `Co-Authored-By:` de un asistente, ni ninguna
otra línea que anuncie con qué herramienta se escribió el código.

El historial responde **qué cambió y por qué**, y quién de las tres personas
del equipo se hace responsable de ese cambio. Con qué editor, plantilla o
asistente se tecleó no es parte de esa respuesta: no cambia el diseño, no
ayuda a revisarlo y no le dice nada a quien lo lea dentro de seis meses
buscando por qué una decisión es como es.

Además, este es un proyecto evaluado. El autor del commit es quien responde
por él ante la cátedra y ante el resto del equipo, y ese nombre ya está en
`%an`. Un segundo autor en el pie no añade responsabilidad, la diluye.

**Si un commit ya se hizo con el pie puesto**, se quita antes de publicarlo
(`git commit --amend`) o, si ya se empujó, reescribiendo el mensaje y
empujando con `--force-with-lease`. Conviene avisar al equipo: `dev-naun` es
la rama desde la que se despliega, y quien la tenga clonada necesita
`git fetch origin && git reset --hard origin/dev-naun` —un `git pull` normal
crearía un merge que devuelve los commits viejos—.

## Por qué esta regla vive aquí y no en `AGENTS.md`

Porque `AGENTS.md` lo reescribe `next dev` en cada arranque: lo genera
`node_modules/next/dist/server/lib/generate-agent-files.js`, y cualquier cosa
que se agregue dentro de ese bloque desaparece. La primera línea de este
archivo lo importa, de modo que valen las dos cosas: lo que Next necesita
decir sobre sí mismo, y lo que el equipo decide sobre su propio historial.
