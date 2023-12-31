
//% color=#BF2F2F icon="\uf0c7" block="Speicherkarte" weight=12
namespace qwiicopenlog
/* 230808 231005
Calliope i2c Erweiterung für SparkFun Qwiic OpenLog
optimiert und getestet für die gleichzeitige Nutzung mehrerer i2c Module am Calliope mini
[Projekt-URL] https://github.com/calliope-net/log-qwiicopenlog
[README]      https://calliope-net.github.io/log-qwiicopenlog

i2c-Modul zum Lesen und Schreiben von Dateien auf Speicherkarte
[Hardware] https://www.sparkfun.com/products/15164
           https://learn.sparkfun.com/tutorials/qwiic-openlog-hookup-guide
[Firmware] https://github.com/sparkfun/Qwiic_OpenLog/archive/refs/heads/master.zip
[cpp-Code] https://github.com/sparkfun/SparkFun_Qwiic_OpenLog_Arduino_Library/archive/main.zip
[Forum]    https://forum.sparkfun.com/viewforum.php?f=105

[Register Map] https://cdn.sparkfun.com/assets/learn_tutorials/8/6/5/newthing.JPG

interne Variablen:
'iStatus' zeigt die letzte Aktion an: init, error_SD, start, dir, read, write, help
    kann zur Menüführung des Benutzers in den 'Knopf A/B' Ereignissen als boolean abgefragt werden oder zur Anzeige als Zahl
String-Array 'aSearchString' vordefinierte Filter für Verzeichnis Suche 'wildcards'
String-Array 'aFileName' die bei Verzeichnis Suche gefundenen Datei-Namen bzw. Verzeichnis-Namen
String-Array 'aFileContent' die gelesene Datei, je 32 Byte bzw. 32 Text-Zeichen in jedem Array-Element 
'iSearchString', 'iFileName', 'iFileContent' ist der aktuelle Index in den Arrays
    damit kann über den Block getString ohne Index-Parameter immer der aktuelle Wert aus den Arrays abgerufen werden
    changeIndex verhindert, dass der Index außerhalb vom Array steht

Blöcke:
'init / set Status' testet, ob eine Speicherkarte bereit ist und stellt den Status auf 'error' oder 'start'
    wird auch aus höheren Menü-Ebenen aufgerufen, um den Status wieder auf 'start' zu stellen

'listDirectory' lädt Datei/Verzeichnis-Namen in das Array; weil der RAM begrenzt ist, wird eine max. Anzahl Dateinamen angegeben
    stellt danach den Index iFileName auf 0 und den Status auf 'dir'

'readFile' lädt die Datei in das Array; weil der RAM begrenzt ist, wird eine max. Anzahl Zeichen angegeben
    pro i2c command werden max. 32 Byte gelesen, die dem Array als ein 32-Zeichen-String-Element hinzu gefügt werden
    lesen endet bei 0xFF vorzeitig oder der angegebenen Anzahl Bytes
    beginnt immer am Anfang der Datei zu lesen; command 'Start Position' hat nicht funktioniert
    stellt danach den Index iFileContent auf 0 und den Status auf 'read'

'writeFile' schreibt in die Datei und teilt den String in Buffer-Größen von 31 Zeichen auf
    wird nur ausgeführt, wenn der Dateiname 8.3 gültig ist; das kann vorher getestet werden
    am Ende kann CR LF angehängt werden
    Datei wird angelegt; wenn sie existiert wird hinten angehängt
    stellt danach den Status auf 'write', die Arrays sind beim schreiben nicht betroffen

Blöcke bei ... mehr
    können über DropDown Listen jedes command von Qwiic OpenLog ausführen
    Dateigröße lesen (das Ergebnis kann bei read als Parameter übergeben werden)
    bei Löschen wird die Anzahl betroffener Dateien/Verzeichnisse zurück gegeben oder -1
    Verzeichnisse anlegen und wechseln (habe ich nicht getestet)
    Dateien anlegen und öffnen (ist nicht nötig, wird mit den Blöcken oben automatisch gemacht)
    Register lesen, status-Register siehe Link [Register Map] oben; Bit 0 wird bei init ausgewertet

'Qwiic OpenLog Test' schreibt verschieden lange Zeilen in Datei, um die Aufteilung in Buffer-Größen zu testen

Programmier-Beispiele, i2c-Module, Bilder, Bezugsquellen:
https://calliope-net.github.io/i2c-test/


Code anhand der original Datenblätter neu programmiert von Lutz Elßner im Juli 2023
 */ {
    const BUFFER_LENGTH: number = 32
    let n_i2cCheck: boolean = false // i2c-Check
    let n_i2cError: number = 0 // Fehlercode vom letzten WriteBuffer (0 ist kein Fehler)

    export enum eADDR { LOG_x2A = 0x2A, LOG_x29 = 0x29 }
    export enum eStatus { init, error_SD, start, dir, read, write, help } // Menüebene, Tasten A B A+B
    export enum eArray { SearchString = eStatus.start, FileName = eStatus.dir, FileContent = eStatus.read }
    export enum eInt { Index, Array_Length, String_Length } // Werte können von den 3 Arrays gelesen werden
    // weitere ENUMs im Code über der entsprechenden function

    let iFirmwareMajor: number = 0
    let iStatus: eStatus = eStatus.init // Menüebene, Tasten A B A+B
    let iSearchString: number = 0, iFileName: number = 0, iFileContent: number = 0 // aktueller Index in den 3 Arrays
    let aSearchString: string[] = ["*.*", "*.TXT", "*.LOG", "LOG*.TXT", "*", "*/"]
    let aFileName: string[], aFileContent: string[] // die 3 Arrays, aSearchString hat schon Items

    // ========== group="Init / Status (letzte Aktion) abfragen"

    //% group="Init / Status (letzte Aktion) abfragen"
    //% block="i2c %pADDR beim Start || i2c-Check %ck" weight=2
    //% pADDR.shadow="qwiicopenlog_eADDR"
    //% ck.shadow="toggleOnOff" ck.defl=1
    export function checkStatusRegister(pADDR: number, ck?: boolean) {
        n_i2cCheck = (ck ? true : false) // optionaler boolean Parameter kann undefined sein
        n_i2cError = 0 // Reset Fehlercode

        //if (iStatus == eStatus.init) readRegister(pADDR, 5) // 5 Initialize
        // nach init hängt sich der i2c-Bus auf, wenn die Speicherkarte fehlt
        // deshalb kein init - firmware siehe unten

        write1Byte(pADDR, eReadRegister.status, true)
        if (n_i2cError == 0) {
            if ((i2cReadBuffer(pADDR, 1).getUint8(0) & 0x01) == 0)
                iStatus = eStatus.error_SD
            else
                iStatus = eStatus.start
        } else
            iStatus = eStatus.init

        aFileContent = null; iFileContent = 0
        aFileName = null; iFileName = 0
    }

    //% group="Init / Status (letzte Aktion) abfragen" weight=1
    //% block="Status = %pStatus"
    export function isStatus(pStatus: eStatus) { return (pStatus == iStatus) }


    // ========== group="i2c Verzeichnis/Datei lesen in internes Array 'FileName'"

    export enum eWriteStringReadString { readFile = 9, list = 14, } // Qwiic OpenLog Register Nummern

    //% group="i2c Verzeichnis lesen in internes Array 'FileName'"
    //% block="i2c %pADDR DIR %pFilename max Dateinamen %pCount" weight=4
    //% pADDR.shadow="qwiicopenlog_eADDR"
    //% pFilename.defl="*.*"
    //% pCount.min=1 pCount.max=16 pCount.defl=8
    export function listDirectory(pADDR: number, pFilename: string, pCount: number) {
        iFileName = 0
        aFileName = [] // internes Array für die Dateinamen leer machen
        let lReadBuffer: Buffer
        let lString: string
        let indexOf_0x00: number

        sendCommandString31(pADDR, eWriteStringReadString.list, pFilename, false)

        // ersten Dateiname lesen
        lReadBuffer = i2cReadBuffer(pADDR, BUFFER_LENGTH)
        while (aFileName.length < pCount && // max. Anzahl zu lesende Dateinamen erreicht
            lReadBuffer.length > 0 && lReadBuffer.getUint8(0) != 0xFF) { // Buffer(0)=FF end of directory listing

            lString = lReadBuffer.toString() // gesamten Buffer in UTF8 String konvertieren
            indexOf_0x00 = lString.indexOf(String.fromCharCode(0)) // Buffer(Index)=0 end of filename
            if (indexOf_0x00 > 0) {
                aFileName.push(lString.substr(0, indexOf_0x00)) // vor dem 0x00 Zeichen ist der String zu Ende
            } else {
                aFileName.push(lString)
            }

            // nächsten Dateiname lesen
            lReadBuffer = i2cReadBuffer(pADDR, BUFFER_LENGTH)
        }
        iStatus = eStatus.dir
    }

    //% group="i2c Datei lesen je 32 Zeichen in Array 'FileContent'"
    //% block="i2c %pADDR Datei lesen %pFilename max Bytes %pSize" weight=2
    //% pADDR.shadow="qwiicopenlog_eADDR"
    //% pSize.min=1 pSize.max=1024 pSize.defl=128
    //% pFilename.defl="config.txt"
    export function readFile(pADDR: number, pFilename: string, pSize: number) {
        // ein i2cReadBuffer holt max. 32 Bytes
        // damit wird dem Array immer ein 32 Zeichen langer String hinzu gefügt
        // die gesamte Datei liegt dann in Teilen in den String-Array Elementen
        // Wiederholung solange gelesene Bytes <= pSize oder vorher bei EOF 0xFF
        iFileContent = 0
        aFileContent = [] // Array für die Text-Datei 32 Zeichen je Array-Element
        let lReadBuffer: Buffer
        let lString: string
        let indexOf_0xFF: number

        if (pSize > 0) {
            //startPosition(pi2cADDR, 4)

            sendCommandString31(pADDR, eWriteStringReadString.readFile, pFilename, false)

            // erste 32 Byte lesen oder weniger wenn pSize < 32
            lReadBuffer = i2cReadBuffer(pADDR, Math.min(BUFFER_LENGTH, pSize))

            // ein leerer Buffer beginnt mit 00, dann folgt 31 mal FF (ist bei DIR anders)
            // wenn das 1. Byte im Buffer 0x00 ist, ist die Datei zu Ende
            while (lReadBuffer.length > 0 && lReadBuffer.getUint8(0) != 0x00) {// Buffer(0)=00 leere Datei Länge 0

                lString = lReadBuffer.toString() // gesamten Buffer in String konvertieren
                indexOf_0xFF = lString.indexOf(String.fromCharCode(0xFF)) // Buffer(Index)=FF end of file
                if (indexOf_0xFF > 0) {
                    aFileContent.push(lString.substr(0, indexOf_0xFF)) // vor dem 0xFF Zeichen ist der String zu Ende
                    break // EOF
                } else {
                    aFileContent.push(lString)
                }

                if (pSize - aFileContent.length * BUFFER_LENGTH > 0) {
                    // nächste 32 Byte lesen
                    lReadBuffer = i2cReadBuffer(pADDR, Math.min(BUFFER_LENGTH, pSize - aFileContent.length * BUFFER_LENGTH))
                } else break
            }
        }
        iStatus = eStatus.read
    }


    // ========== group="interne Arrays SearchString, FileName, FileContent"

    //% group="interne Arrays SearchString, FileName, FileContent"
    //% block="ändere Index in Array %pArray um %pAdd" weight=74
    export function changeIndex(pArray: eArray, pAdd: number) {
        if (pArray == eArray.SearchString && (iSearchString + pAdd) >= 0 && (iSearchString + pAdd) < aSearchString.length)
            iSearchString += pAdd
        else if (pArray == eArray.FileName && (iFileName + pAdd) >= 0 && (iFileName + pAdd) < aFileName.length)
            iFileName += pAdd
        else if (pArray == eArray.FileContent && (iFileContent + pAdd) >= 0 && (iFileContent + pAdd) < aFileContent.length)
            iFileContent += pAdd
    }

    //% group="interne Arrays SearchString, FileName, FileContent"
    //% block="%pArray" weight=72
    export function getString(pArray: eArray) {
        if (pArray == eArray.SearchString)
            return aSearchString.get(iSearchString)
        else if (pArray == eArray.FileName && aFileName != null && aFileName.length > iFileName)
            return aFileName.get(iFileName)
        else if (pArray == eArray.FileContent && aFileContent != null && aFileContent.length > iFileContent)
            return aFileContent.get(iFileContent)
        else return pArray.toString()
    }

    //% group="interne Arrays SearchString, FileName, FileContent"
    //% block="lese interne Variable %pArray %pInt" weight=70
    export function getInt(pArray: eArray, pInt: eInt) {
        if (pArray == eArray.SearchString) {
            if (pInt == eInt.Index) return iSearchString
            else if (pInt == eInt.Array_Length) return aSearchString.length
            else if (pInt == eInt.String_Length) return aSearchString.get(iSearchString).length
            else return -1
        }
        else if (pArray == eArray.FileName) {
            if (pInt == eInt.Index) return iFileName
            else if (pInt == eInt.Array_Length) return aFileName.length
            else if (pInt == eInt.String_Length) return aFileName.get(iFileName).length
            else return -1
        }
        else if (pArray == eArray.FileContent) {
            if (pInt == eInt.Index) return iFileContent
            else if (pInt == eInt.Array_Length) return aFileContent.length
            else if (pInt == eInt.String_Length) return aFileContent.get(iFileContent).length
            else return -1
        }
        else return -1
    }


    // ========== group="i2c Datei schreiben"

    //% group="i2c Datei schreiben"
    //% block="ist Dateiname 8.3 gültig %pFilename" weight=3
    export function checkFileName8punkt3(pFilename: string): boolean {
        let a: string[] = pFilename.split(".", 2)
        return (a.length == 2 && a.get(0).length > 0 && a.get(0).length <= 8 && a.get(1).length > 0 && a.get(1).length <= 3)
    }

    export enum eCRLF { CRLF, _ }

    //% group="i2c Datei schreiben"
    //% block="i2c %pADDR Datei schreiben %pFilename %pText %pCRLF" weight=2
    //% pADDR.shadow="qwiicopenlog_eADDR"
    //% pFilename.defl="TEST.LOG"
    //% inlineInputMode=inline
    export function writeFile(pADDR: number, pFilename: string, pText: string, pCRLF: eCRLF) {
        if (checkFileName8punkt3(pFilename)) {
            sendCommandString31(pADDR, eWriteString.openFile, pFilename, false) // Append (open or create and open)
            if (pCRLF == eCRLF.CRLF) { pText = pText + String.fromCharCode(13) + String.fromCharCode(10) }
            if (pText.length <= 31) {
                sendCommandString31(pADDR, eWriteString.writeFile, pText, false)
            } else {
                for (let Index = 0; Index < pText.length; Index += 31) {
                    sendCommandString31(pADDR, eWriteString.writeFile, pText.substr(Index, Math.min(31, pText.length - Index)), false)
                }
            }
            iStatus = eStatus.write
        }
    }

    //% group="i2c Datei schreiben"
    //% block="i2c %pADDR syncFile (Speicherkarte entfernen)" weight=1
    //% pADDR.shadow="qwiicopenlog_eADDR"
    export function syncFile(pADDR: number) {
        //if you definitely want your buffer synced right now then you can manually call it
        if (iFirmwareMajor == 0) { iFirmwareMajor = readRegister(pADDR, eReadRegister.firmwareMajor) }
        if (iFirmwareMajor >= 3) {
            write1Byte(pADDR, eWriteString.syncFile, false)
        }
    }

    // ========== advanced=true

    // ========== group="i2c Dateigröße lesen, Datei/Verzeichnis löschen (Int32)" advanced=true

    export enum eWriteStringReadInt32BE { fileSize = 13, remove = 15, removeRecursively = 16 } // Qwiic OpenLog Register Nummern

    //% group="i2c Dateigröße lesen, Datei/Verzeichnis löschen (Int32)" advanced=true
    //% block="i2c %pADDR %pRegister Name %pFilename"
    //% pADDR.shadow="qwiicopenlog_eADDR"
    //% pFilename.defl="LOG*.TXT"
    export function readInt32BE(pADDR: number, pRegister: eWriteStringReadInt32BE, pFilename: string) {
        sendCommandString31(pADDR, pRegister, pFilename, true)
        return i2cReadBuffer(pADDR, 4).getNumber(NumberFormat.Int32BE, 0)
    }

    // ========== group="i2c Datei/Verzeichnis anlegen/öffnen (write only)" advanced=true

    export enum eWriteString { // Qwiic OpenLog Register Nummern
        createFile = 6, makeDirectory = 7, changeDirectory = 8, startPosition = 10, openFile = 11, writeFile = 12, syncFile = 17
    }
    //% group="i2c Datei/Verzeichnis anlegen/öffnen (write only)" advanced=true
    //% block="i2c %pADDR %pRegister Name %pFilename repeat %repeat"
    //% pADDR.shadow="qwiicopenlog_eADDR"
    //% pRegister.defl=qwiicopenlog.eWriteString.changeDirectory pFilename.defl=".."
    //% inlineInputMode=inline
    export function writeString(pADDR: number, pRegister: eWriteString, pFilename: string, repeat: boolean) {
        sendCommandString31(pADDR, pRegister, pFilename, repeat)
    }


    // ========== group="i2c Qwiic OpenLog Register (id, status, firmware) lesen (Byte)" advanced=true

    export enum eReadRegister { // Qwiic OpenLog Register Nummern
        id = 0, status = 1, firmwareMajor = 2, firmwareMinor = 3, // interruptEnable = 4, initialize-writeonly = 5
        i2cAddress = 0x1E
    }
    //% group="i2c Qwiic OpenLog Register (id, status, firmware) lesen (Byte)" advanced=true
    //% block="i2c %pADDR Register %pRegister"
    //% pADDR.shadow="qwiicopenlog_eADDR"
    export function readRegister(pADDR: number, pRegister: eReadRegister) {
        write1Byte(pADDR, pRegister, true)
        return i2cReadBuffer(pADDR, 1).getNumber(NumberFormat.Int8LE, 0)
    }


    // ========== group="i2c Qwiic OpenLog Test" advanced=true

    //% group="i2c Qwiic OpenLog Test" advanced=true
    //% block="i2c %pADDR schreibe Zeilen 0 bis 94 Zeichen Länge in Datei %pFilename"
    //% pADDR.shadow="qwiicopenlog_eADDR"
    //% pFilename.defl="ASCII94.LOG"
    export function testWrite(pADDR: number, pFilename: string) {
        let s = ""
        for (let i = 0; i <= 94; i++) {
            writeFile(pADDR, pFilename, s, eCRLF.CRLF)
            s = s + String.fromCharCode(i + 33)
        }
    }


    // ========== group="Status 2:Start 3:DIR gelesen 4:Datei gelesen 5:Datei geschrieben" advanced=true

    //% group="Status 2:Start 3:DIR gelesen 4:Datei gelesen 5:Datei geschrieben" advanced=true
    //% block="lese Status (letzte Aktion)" weight=30
    export function getStatus(): eStatus { return iStatus }


    /*
        //% group="i2c Test" advanced=true
        //% block="i2c %pi2cADDR lösche %pCount leere LOG00*.TXT und schreibe Protokoll-Datei %pFilename"
        //% pCount.min=1 pCount.max=16 pCount.defl=8
        //% logFilename.defl="REMOVE.LOG"
        export function remove(pADDR: eADDR, pCount: number, logFilename: string) {
            let iSize: number, iCount: number, sText: string
    
            // liest pCount Dateinamen nach Muster "LOG00*.TXT" in Array aFileName
            listDirectory(pADDR, "LOG00*.TXT", pCount)
            // Länge des Arrays aFileName=Anzahl Dateinamen fürs Protokoll
            sText = getInt(eArray.FileName, eInt.Array_Length) + " Dateien"
            // schreibt sText auf Display Zeile 0 Zeichen 0-9
            lcd16x2rgb.writeText2(lcd16x2rgb.eADDR_LCD.LCD_16x2, 0, 0, 9, lcd16x2rgb.eAlign.left, sText)
            // schreibt sText in Protokoll-Datei logFilename auf Speicherkarte
            writeFile(pADDR, logFilename, sText, eCRLF.CRLF)
            // Zähler für gelöschte Dateien
            iCount = 0
            // Schleife durch alle gefundenen Dateinamen, kann weniger als pCount sein
            for (let Index = 0; Index <= getInt(eArray.FileName, eInt.Array_Length) - 1; Index++) {
                // fragt Register 13 fileSize vom aktuellen Dateiname (Array aFileName(iFileName))
                iSize = readInt32BE(pADDR, eWriteStringReadInt32BE.fileSize, getString(eArray.FileName))
                // schreibt iSize auf Display Zeile 0 Zeichen 10-15 rechtsbündig
                lcd16x2rgb.writeText2(lcd16x2rgb.eADDR_LCD.LCD_16x2, 0, 10, 15, lcd16x2rgb.eAlign.right, iSize.toString())
                // schreibt aktuellen Dateiname auf Display Zeile 1 Zeichen 0-15
                lcd16x2rgb.writeText2(lcd16x2rgb.eADDR_LCD.LCD_16x2, 1, 0, 15, lcd16x2rgb.eAlign.left, getString(eArray.FileName))
                // schreibt aktuellen Dateiname und iSize in Protokoll-Datei logFilename auf Speicherkarte
                writeFile(pADDR, logFilename, getString(eArray.FileName) + " " + iSize + " Bytes", eCRLF.CRLF)
                // nur wenn die Datei leer ist, soll sie gelöscht werden
                if (iSize == 0) {
                    // sendet aktuellen Dateiname an Register 15 remove
                    // und bekommt Anzahl gelöschter Dateien zurück, 1 oder 0 wird zum Zähler addiert
                    iCount += readInt32BE(pADDR, eWriteStringReadInt32BE.remove, getString(eArray.FileName))
                }
                basic.pause(1000)
                // Index im internen Array auf nächsten Dateiname stellen (iFileName)
                changeIndex(eArray.FileName, 1)
            }
            // Anzahl gelöschter Dateien fürs Protokoll auf Display und in die Datei auf Speicherkarte
            sText = iCount + " gelöscht"
            lcd16x2rgb.writeText2(lcd16x2rgb.eADDR_LCD.LCD_16x2, 0, 0, 15, lcd16x2rgb.eAlign.left, sText)
            writeFile(pADDR, logFilename, sText, eCRLF.CRLF)
        }
    */

    // ========== PRIVATE function

    function startPosition(pADDR: number, pPosition: number) {
        let b = Buffer.create(2)
        b.setUint8(0, eWriteString.startPosition)
        b.setUint8(1, pPosition) // es wird nur das 1. Byte ausgewertet - siehe unten
        i2cWriteBuffer(pADDR, b)
        control.waitMicros(50)
    }

    function sendCommandString31(pADDR: number, pCommand: number, pText: string, repeat: boolean) {
        if (pText.length > 31) {
            pText = pText.substr(0, 31)
        }
        let b = Buffer.create(pText.length + 1)
        b.setUint8(0, pCommand)
        for (let Index = 0; Index <= pText.length - 1; Index++) {
            b.setUint8(Index + 1, pText.charCodeAt(Index))
        }
        i2cWriteBuffer(pADDR, b, repeat)
        control.waitMicros(50)
    }

    function write1Byte(pADDR: number, pRegister: number, repeat: boolean) {
        let b = Buffer.create(1)
        b.setUint8(0, pRegister)
        i2cWriteBuffer(pADDR, b, repeat)
    }


    // ========== group="i2c Adressen"

    //% blockId=qwiicopenlog_eADDR
    //% group="i2c Adressen" advanced=true
    //% block="%pADDR" weight=4
    export function qwiicopenlog_eADDR(pADDR: eADDR): number { return pADDR }

    //% group="i2c Adressen" advanced=true
    //% block="i2c Fehlercode" weight=2
    export function i2cError() { return n_i2cError }

    function i2cWriteBuffer(pADDR: number, buf: Buffer, repeat: boolean = false) {
        if (n_i2cError == 0) { // vorher kein Fehler
            n_i2cError = pins.i2cWriteBuffer(pADDR, buf, repeat)
            if (n_i2cCheck && n_i2cError != 0)  // vorher kein Fehler, wenn (n_i2cCheck=true): beim 1. Fehler anzeigen
                basic.showString(Buffer.fromArray([pADDR]).toHex()) // zeige fehlerhafte i2c-Adresse als HEX
        } else if (!n_i2cCheck)  // vorher Fehler, aber ignorieren (n_i2cCheck=false): i2c weiter versuchen
            n_i2cError = pins.i2cWriteBuffer(pADDR, buf, repeat)
        //else { } // n_i2cCheck=true und n_i2cError != 0: weitere i2c Aufrufe blockieren
    }

    function i2cReadBuffer(pADDR: number, size: number, repeat: boolean = false): Buffer {
        if (!n_i2cCheck || n_i2cError == 0)
            return pins.i2cReadBuffer(pADDR, size, repeat)
        else
            return Buffer.create(size)
    }

    /*
    
    [Firmware] https://github.com/sparkfun/Qwiic_OpenLog/archive/refs/heads/master.zip
        \Qwiic_OpenLog-master\Firmware\Qwiic_OpenLog\commands.ino
    
    ####
    0x05 Initialize
    ####
    void initFunction(char *myData) {
      if (!sd.begin(SD_CHIP_SELECT, SPI_FULL_SPEED)) systemError(ERROR_CARD_INIT);
      if (!sd.chdir()) systemError(ERROR_ROOT_INIT); //Change to root directory
    
      valueMap.status |= (1 << STATUS_LAST_COMMAND_SUCCESS); //Command successful. Set status bit.
    }
    
    ####
    0x08 Change Directory - Writing ".." changes to the root
    ####
    void chDir(char *myData) {
      if (myData[0] == '.' && myData[1] == '.')
      {
        //User is trying to move up the directory tree. Move to root instead
        //TODO store the parent directory name and change to that instead
        if (sd.chdir("/")) //Change to root
    ...
    }
    
    ####
    0x0A Start Position für Read File kann max. 255 sein: (myData[0] ein Byte nach 0x0A)
    ####
    void setStartPosition(char *myData) {
      valueMap.startPosition = (int)myData[0];
      valueMap.status |= (1 << STATUS_LAST_COMMAND_SUCCESS); //Command success
    }
    
    ####
    0x11 Sync File (ab firmware version 3.0) wertet den Parameter myData nicht aus
    ####
    //we don't actually want to sync() every time we write to the buffer
    //writing a full buffer to the card and writing 1 or 2 bytes seems
    //to take about the same amount of time. Once the buffer is full
    //it will automatically sync anyways.
    void writeFile(char *myData) {
      workingFile.write(myData, strlen(myData));
      valueMap.status |= (1 << STATUS_LAST_COMMAND_SUCCESS); //Command success
    }
    
    //if you definitely want your buffer synced right now then you can manually call it
    void syncFile(char *myData) {
      workingFile.sync();
      valueMap.status |= (1 << STATUS_LAST_COMMAND_SUCCESS); //Command success
    }
    */
} // qwiicopenlog.ts

