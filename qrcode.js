const EXP_TABLE = new Array(256) // 指数对应的十进制数字数组
const LOG_TABLE = new Array(256) // 十进制数字对应的指数数组

/*
 * 初始化 伽罗瓦域 (Galois Field) 
 * 伽罗瓦域： 任何数值均属于0-255，例如底数为α（默认为2）的计算方法：
 * 当指数n超过255时，该指数计算方法为 α^275 = α^(275%255) = α^20
 * 当结果超过255时，需要将该数与285执行异或操作，计算方法为 α^8 = 256 ^ 285 = 29, α^9 = α^8 * α = 29 * 2 = 58
 */
~(function initGaloisField256() {
    for (let i = -1; ++i < 8;) {
        EXP_TABLE[i] = 1 << i
        LOG_TABLE[EXP_TABLE[i]] = i
    }
    for (let i = 7; ++i < 255;) {
        EXP_TABLE[i] = EXP_TABLE[i - 1] << 1
        if (EXP_TABLE[i] >= 256) {
            EXP_TABLE[i] = EXP_TABLE[i] ^ 285
        }
        LOG_TABLE[EXP_TABLE[i]] = i
    }
})()

function getMathMod(n) {
    // 处理两种情况 n > 255 和 n < 0，虽然8bit这里不会出现负数
    return (n % 255 + 255) % 255
}

function getMathExp(n) {
    return EXP_TABLE[getMathMod(n)]
}

function getMathLog(n) {
    return LOG_TABLE[n]
}
class QRCode {
    constructor(data) {
        this.data = data
        this.dataMode = 1 << 2 // 使用8bit-byte格式
        this.version = 2
        this.errorCorrectionLevel = {
            L: 0b01,
            M: 0b00,
            Q: 0b11,
            H: 0b10
        }
        this.maskPattern = (1 << 2) | (1 << 1) | (1 << 0)
        this.moduleSize = (this.version - 1) * 4 + 21
        this.initModules() // 初始化模块矩阵
        this.setPositionDetectionPattern() // 设置定位图案
        this.setTimingPattern() // 设置时序图案
        this.setAlignmentPattern() // 设置对齐图案
        this.setFormatInfo() // 设置格式信息
        this.mapData(this.getDataCodeInfo()) // 设置数据和纠错码
    }


    /**
     * 生成对应版本的modules数组
     */
    initModules() {
        this.modules = new Array(this.moduleSize).fill().map(() => new Array(this.moduleSize))
    }

    getData() {
        return this.modules
    }

    /**
     * 设置定位图案，无论版本多少，定位块大小都是 7 * 7
     */
    setPositionDetectionPattern() {
        // 方便处理加上白边
        const detection = [
            [1, 1, 1, 1, 1, 1, 1, 0],
            [1, 0, 0, 0, 0, 0, 1, 0],
            [1, 0, 1, 1, 1, 0, 1, 0],
            [1, 0, 1, 1, 1, 0, 1, 0],
            [1, 0, 1, 1, 1, 0, 1, 0],
            [1, 0, 0, 0, 0, 0, 1, 0],
            [1, 1, 1, 1, 1, 1, 1, 0],
            [0, 0, 0, 0, 0, 0, 0, 0],
        ];
        /* 利用对称属性填充三个角的定位图案*/
        for (let r = -1; ++r <= 7;) {
            const positions = detection[r]
            const row = this.modules[r]
            const lastRow = this.modules[this.moduleSize - r - 1]
            for (let c = -1; ++c <= 7;) {
                const val = positions[c]
                const lastCol = this.moduleSize - c - 1
                row[c] = val // 左上角
                row[lastCol] = val // 右上角
                lastRow[c] = val // 左下角
            }
        }
    }

    /**
     * 设置时序图案
     */
    setTimingPattern() {
        for (let r = 7; ++r <= this.moduleSize - 9;) {
            this.modules[6][r] = this.modules[r][6] = (r + 1) & 1
        }
    }

    /**
     * 设置对齐图案（AlignmentPattern）
     */
    setAlignmentPattern() {
        // [6, 18]表示的是组合，因为右上，坐上，左下都已经有定位图案，故只需要考虑 右下一种组合，因此版本为2的二维码对齐图案位置为18,18
        const alignment = [
            [1, 1, 1, 1, 1],
            [1, 0, 0, 0, 1],
            [1, 0, 1, 0, 1],
            [1, 0, 0, 0, 1],
            [1, 1, 1, 1, 1],
        ];
        // 利用图形对称设置数据
        for (let r = -1; ++r < 5;) {
            for (let c = 0; c < 5; c++) {
                const pRow = r + 18 - 2
                const pCol = c + 18 - 2
                this.modules[pRow][pCol] = alignment[r][c]
            }
        }
    }

    /**
     * 数据
     */
    setFormatInfo() {
        const BCH_DIGIT = this.getBCHFormatInfo((this.errorCorrectionLevel.L << 3) | this.maskPattern)

        // 拿到的是反序的数组，需颠倒操作
        const typeInfo = Array.prototype.reverse.call([...this.getBinaryBit(BCH_DIGIT, 10)]).map(item => +item)
        for (let i = -1; ++i < 15;) {
            // 设置左上角信息
            if (i < 6) {
                this.modules[i][8] = typeInfo[i]
            } else if (i > 8) {
                this.modules[8][14 - i] = typeInfo[i]
            } else {
                const r = Math.min(i + 1, 8)
                const c = Math.min(15 - i, 8)
                this.modules[r][c] = typeInfo[i]
            }

            // 设置右上角和右下角
            const r = i > 7 ? (this.moduleSize - 15 + i) : 8
            const c = i <= 7 ? (this.moduleSize - 1 - i) : 8
            this.modules[r][c] = typeInfo[i]
        }
        //固定黑块darkModule
        this.modules[this.moduleSize - 8][8] = 1
    }

    getDataCodeInfo() {
        const code_works = { totalCount: 44, dataCount: 34 }
        let binaryData = ''

        // 编码数据格式,8bit模式为 1 << 2
        binaryData += this.getBinaryBit(this.dataMode, 4)

        // 数据长度
        binaryData += this.getBinaryBit(this.data.length, 8)
        for (let i = -1, len = this.data.length; ++i < len;) {
            binaryData += this.getBinaryBit(this.data.charCodeAt(i), 8)
        }
        // 加上结束符为0000
        binaryData += this.getBinaryBit(0, 4)
        const dataCount = code_works.dataCount * 8
        if (binaryData.length > dataCount) {
            throw new Error('code length overflow')
        }
        // 加上补齐符号，如果不为8的倍数后面需补上0
        if (binaryData.length % 8) {
            binaryData += this.getBinaryBit(0, 8 - binaryData.length % 8)
        }
        // 如果还未达到34个coedworks，需要设置补齐码，重复11101100 和 00010001
        // const PADDING_BIT1 = (1 << 7) | (1 << 6) | (1 << 5) | (1 << 3) | (1 << 2)
        // const PADDING_BIT2 = (1 << 4) | (1 << 0)
        // 直接把11101100 和 00010001合并成一个二进制的写法
        const PADDING_BITS = (1 << 15) | (1 << 14) | (1 << 13) | (1 << 11) | (1 << 10) | (1 << 4) | (1 << 0)
        while (binaryData.length < dataCount) {
            binaryData += this.getBinaryBit(PADDING_BITS, 16).slice(0, dataCount - binaryData.length)
        }
        const dataCode = new Array(code_works.dataCount)

        // 8bit模式支持范围是[0x00 ~ 0xff]，对数据取模保证二维码正常生成
        for (let i = 0, len = dataCode.length; i < len; i++) {
            dataCode[i] = +`0b${binaryData.slice(i * 8, i * 8 + 8)}` % 0xff
        }
        // 生成消息多项式
        let messagePolynomial = dataCode.map(item => getMathLog(item))
        const count = messagePolynomial.length // 循环计算次数为消息多项式的项式长度

        // 生成多项式，qr_code中 10 codework 的纠错码生成多项式为 
        // x^10 + α^251*x^9 + α^67*x^8 + α^46*x7 + α^61*x^6 + α^118*x^5 + α^70*x^4 + α^64*x^3 + α^94*x^2 + α^32*x + α^45
        // 存储为指数方便计算
        const generatorPolynomial = [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45]
        const maxMessageExp = count + generatorPolynomial.length - 1
        for (let i = -1; ++i < count;) {
            const messageExp = messagePolynomial[0] || 0
            for (let j = 0, len = maxMessageExp - i - 1; j <= len; j++) {
                const generatorExp = generatorPolynomial[j]
                const multiply = generatorExp === undefined ? 0 : getMathExp(getMathMod(generatorExp + messageExp))
                messagePolynomial[j] = getMathLog(multiply ^ getMathExp(messagePolynomial[j]))
            }
            // 系数相同的首项异或后为0，移除该项
            messagePolynomial.shift()
        }
        return [...dataCode, ...messagePolynomial.map(exp => getMathExp(exp))]
    }

    /**
     * 
     * @param {*} formatData 15bit编码信息
     * @returns 
     */
    getBCHFormatInfo(formatData) {
        // 自乘n阶，n为纠错bit位数，这里为10，相当于左移10位
        let bch_code = formatData << 10;
        // 按照QR_CODE中G15为 G(x) = x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
        const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
        // 计算二进制数据的最大位数幂, 用于求多项式长除余项
        const getMaxExponent = (num) => {
            return num && num.toString(2).length
        }
        const G15Digit = getMaxExponent(G15)
        while (getMaxExponent(bch_code) - G15Digit >= 0) {
            bch_code ^= G15 << (getMaxExponent(bch_code) - G15Digit)
        }
        // 定义需要执行异或运算的15bit二进制数据“101010000010010”，以下写法不限，只要结果等同于十进制的21522就行
        // const G15_MASK = 0b101010000010010 二进制写法，下面通过位移+或运算计算
        const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
        // 最终得到的bch_code为 10bit 的纠错码
        return ((formatData << 10) | bch_code) ^ G15_MASK
    };

    /**
     * 映射数据规则，前面已经填充所有信息（定位图案、对齐图案、时序图案、格式信息），2版本无版本信息，故剩余的未填充均为数据区域
     * @param {*} data （数据码+纠错码）
     */
    mapData(data) {
        let direction = -1 // 填充方向，负数向上，整数向下
        let row = this.moduleSize - 1
        let bitIndex = 7
        let byteIndex = 0 // 数据编号，用于读取data（数据码+纠错码）中的数据
        for (let col = row; col > 0; col -= 2) {
            // 避开时序线
            if (col === 6) col--;
            while (true) {
                for (let c = 0; c < 2; c++) {
                    // 跳过已填充数据的格子
                    if (this.modules[row][col - c] !== undefined) {
                        continue
                    }
                    let dark = false
                    if (byteIndex < data.length) {
                        dark = ((data[byteIndex] >>> bitIndex) & 1) === 1
                    }
                    let mask = this.getMask(this.maskPattern, row, col - c)
                    if (mask) {
                        dark = !dark
                    }
                    this.modules[row][col - c] = +dark
                    bitIndex--
                    if (bitIndex === -1) {
                        byteIndex++
                        bitIndex = 7
                    }
                }
                row += direction

                // 走到尽头了，改变方向
                if (row < 0 || this.moduleSize <= row) {
                    row -= direction
                    direction *= -1
                    break
                }
            }
        }
    }

    /**
     *  
     * @param {*} num 十进制数据
     * @param {*} bit 生成的二进制位数
     * @returns 
     */
    getBinaryBit(num, bit) {
        return num.toString(2).padStart(bit, '0')
    }

    /**
     * 官方推荐8种mask方案，选择一个合适的mask需要计算惩罚分数，这里因为版本低随便选一个
     * @param {*} maskPattern 
     * @param {*} i 
     * @param {*} j 
     * @returns 
     */
    getMask(maskPattern, i, j) {
        switch (maskPattern) {
            case 0b000:
                return (i + j) % 2 == 0
            case 0b001:
                return i % 2 == 0
            case 0b010:
                return j % 3 == 0
            case 0b011:
                return (i + j) % 3 == 0
            case 0b100:
                return (~~(i / 2) + ~~(j / 3)) % 2 == 0
            case 0b101:
                return ((i * j) % 2) + ((i * j) % 3) == 0
            case 0b110:
                return (((i * j) % 2) + ((i * j) % 3)) % 2 == 0
            case 0b111:
                return (((i * j) % 3) + ((i + j) % 2)) % 2 == 0
            default:
                throw new Error(`${maskPattern} maskPattern is not suggested`)
        }
    }

}

typeof module !== 'undefined' && (module.export = QRCode)