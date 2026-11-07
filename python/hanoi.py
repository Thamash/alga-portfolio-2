def hanoi(n, honnan, segéd, hova):
    if n == 1:
        print(honnan, "->", hova)
        return
    hanoi(n - 1, honnan, hova, segéd)
    print(honnan, "->", hova)
    hanoi(n - 1, segéd, honnan, hova)

hanoi(3, "A", "B", "C")
