magassagok = [152, 161, 148, 170, 165, 158, 170]
legmagasabb = magassagok[0]
hely = 0
for i in range(1, len(magassagok)):
    if magassagok[i] > legmagasabb:
        legmagasabb = magassagok[i]
        hely = i
print("A legmagasabb:", legmagasabb, "cm, a(z)", hely + 1, ". gyerek")
