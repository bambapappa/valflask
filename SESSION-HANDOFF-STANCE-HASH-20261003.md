# Kopplingsprövning till partibesked

Isolerad rättelse från main bc7da579. kanon(koppling) band tidigare bara promise_id; två stance_id gav samma prövningshash. stance_id inkluderas nu när det finns. Löfteskopplingars tidigare hash bevaras. Gamla ståndpunktskopplingsprövningar ska omprövas, inte konverteras genom påhittat sakgodkännande.

15/15 riktade native tester passerar, inklusive Python-genererad delad fixture och målbytesgrind. Exportören i Handoff #503 uppdateras parallellt. Ingen data ändrad. Kör exact-head CI och granska innan merge; publicering är separat.
