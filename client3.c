#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>
#include <winsock2.h>
#include <math.h>

#pragma comment(lib,"ws2_32.lib")

/* ---------------- CONFIG ---------------- */
#define SERVER_PORT 8888
#define BUF_SIZE 1024
#define NODE_ID 3                 // 🔴 CHANGE THIS ONLY
#define COM_PORT "\\\\.\\COM9"

/* -------- SEND CONTROL -------- */
#define SEND_INTERVAL_MS (2 * 60 * 1000)   // 2 minutes
#define HEARTBEAT_INTERVAL_MS 5000         // 🔥 heartbeat every 5 sec
#define TEMP_THRESHOLD  0.5                // °C
#define HUM_THRESHOLD   2.0                // %

/* ---------------------------------------- */
HANDLE hSerial = INVALID_HANDLE_VALUE;
DWORD lastSendTime = 0;
DWORD lastHeartbeat = 0;
float lastTemp = -1000;
float lastHum  = -1000;

/* ---------- OPEN ARDUINO ---------- */
int openArduino() {
    hSerial = CreateFile(
        COM_PORT,
        GENERIC_READ,
        0,
        NULL,
        OPEN_EXISTING,
        0,
        NULL
    );

    if (hSerial == INVALID_HANDLE_VALUE)
        return 0;

    DCB dcb = {0};
    dcb.DCBlength = sizeof(dcb);
    GetCommState(hSerial, &dcb);

    dcb.BaudRate = CBR_9600;
    dcb.ByteSize = 8;
    dcb.StopBits = ONESTOPBIT;
    dcb.Parity   = NOPARITY;

    SetCommState(hSerial, &dcb);
    return 1;
}

/* ---------- READ SENSOR ---------- */
int readSensor(float *temp, float *hum) {
    static char line[256];
    static int idx = 0;
    char ch;
    DWORD bytesRead;

    while (1) {
        if (!ReadFile(hSerial, &ch, 1, &bytesRead, NULL))
            return 0;

        if (bytesRead == 0)
            return 0;

        if (ch == '\n') {
            line[idx] = '\0';
            idx = 0;

            if (sscanf(line, "TEMP:%f,HUM:%f", temp, hum) == 2)
                return 1;
            else
                return -1;
        }

        if (idx < sizeof(line) - 1)
            line[idx++] = ch;
    }
}

/* ---------- SHOULD SEND ? ---------- */
int shouldSend(float temp, float hum) {
    DWORD now = GetTickCount();

    int timeOK = (now - lastSendTime) >= SEND_INTERVAL_MS;
    int tempOK = fabs(temp - lastTemp) >= TEMP_THRESHOLD;
    int humOK  = fabs(hum  - lastHum)  >= HUM_THRESHOLD;

    return timeOK || tempOK || humOK;
}

/* ================= MAIN ================= */
int main() {
    WSADATA wsa;
    SOCKET sock;
    struct sockaddr_in serverAddr;
    char serverIP[50], buffer[BUF_SIZE];

    WSAStartup(MAKEWORD(2,2), &wsa);
    sock = socket(AF_INET, SOCK_DGRAM, 0);

    printf("Enter Server IP: ");
    scanf("%49s", serverIP);

    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(SERVER_PORT);
    serverAddr.sin_addr.s_addr = inet_addr(serverIP);

    /* ---------- REGISTER ---------- */
    sprintf(buffer, "REGISTER:NODE:%d", NODE_ID);
    sendto(sock, buffer, strlen(buffer), 0,
           (struct sockaddr*)&serverAddr, sizeof(serverAddr));

    printf("✅ Node %d registered\n", NODE_ID);

    /* ---------- CLIENT 1 (Arduino) ---------- */
    if (NODE_ID == 1) {
        printf("Waiting for Arduino...\n");

        while (!openArduino()) {
            printf("⏳ Arduino not connected, retrying...\n");
            Sleep(3000);
        }

        printf("✅ Arduino connected\n");

        while (1) {
            DWORD now = GetTickCount();

            /* ---------- HEARTBEAT (SILENT) ---------- */
            if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
                sprintf(buffer, "HEARTBEAT:NODE:%d", NODE_ID);
                sendto(sock, buffer, strlen(buffer), 0,
                       (struct sockaddr*)&serverAddr, sizeof(serverAddr));
                lastHeartbeat = now;
            }

            float temp, hum;
            int status = readSensor(&temp, &hum);

            if (status == 1) {
                printf("📡 Read -> Temp: %.2f°C  Hum: %.2f%%\n", temp, hum);

                /* Store in shared file */
                FILE *fp = fopen("shared_data.txt", "w");
                if (fp) {
                    fprintf(fp, "TEMP=%.2f HUM=%.2f\n", temp, hum);
                    fclose(fp);
                }

                if (shouldSend(temp, hum)) {
                    printf("🚀 Sending data to server\n");

                    sprintf(buffer, "NODE:%d", NODE_ID);
                    sendto(sock, buffer, strlen(buffer), 0,
                           (struct sockaddr*)&serverAddr, sizeof(serverAddr));

                    sprintf(buffer, "DATA:TEMP=%.2f HUM=%.2f", temp, hum);
                    sendto(sock, buffer, strlen(buffer), 0,
                           (struct sockaddr*)&serverAddr, sizeof(serverAddr));

                    sendto(sock, "EOF", 3, 0,
                           (struct sockaddr*)&serverAddr, sizeof(serverAddr));

                    lastTemp = temp;
                    lastHum  = hum;
                    lastSendTime = now;
                } else {
                    printf("⏸️ No significant change\n");
                }
            }

            Sleep(5000);   // read every 5 seconds
        }
    }

    /* ---------- OTHER CLIENTS (2,3,4...) ---------- */
    else {
        printf("Waiting to read shared file...\n");

        while (1) {
            DWORD now = GetTickCount();

            /* ---------- HEARTBEAT (SILENT) ---------- */
            if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
                sprintf(buffer, "HEARTBEAT:NODE:%d", NODE_ID);
                sendto(sock, buffer, strlen(buffer), 0,
                       (struct sockaddr*)&serverAddr, sizeof(serverAddr));
                lastHeartbeat = now;
            }

            float temp = 0, hum = 0;
            int fileOK = 0;

            FILE *fp = fopen("shared_data.txt", "r");
            if (fp) {
                if (fscanf(fp, "TEMP=%f HUM=%f", &temp, &hum) == 2)
                    fileOK = 1;
                fclose(fp);
            }

            if (fileOK) {
                printf("📥 Read from file -> Temp: %.2f°C  Hum: %.2f%%\n",
                       temp, hum);

                if (shouldSend(temp, hum)) {
                    printf("🚀 Forwarding to server\n");

                    sprintf(buffer, "NODE:%d", NODE_ID);
                    sendto(sock, buffer, strlen(buffer), 0,
                           (struct sockaddr*)&serverAddr, sizeof(serverAddr));

                    sprintf(buffer, "DATA:TEMP=%.2f HUM=%.2f", temp, hum);
                    sendto(sock, buffer, strlen(buffer), 0,
                           (struct sockaddr*)&serverAddr, sizeof(serverAddr));

                    sendto(sock, "EOF", 3, 0,
                           (struct sockaddr*)&serverAddr, sizeof(serverAddr));

                    lastTemp = temp;
                    lastHum  = hum;
                    lastSendTime = now;
                } else {
                    printf("⏸️ Forward skipped\n");
                }
            }

            Sleep(5000);
        }
    }

    closesocket(sock);
    WSACleanup();
    return 0;
}
