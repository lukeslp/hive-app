/*
 * File Purpose: Verify downloaded model artifacts before they become executable input.
 * Primary Components: SHA-256 normalization, streaming digest, constant-time comparison.
 * I/O: Reads a local file and returns/compares its lowercase SHA-256 digest.
 */
package app.ideatiles.android

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

internal object ModelArtifactVerifier {
    private val sha256Pattern = Regex("^[a-f0-9]{64}$")

    fun normalizeSha256(value: String): String? {
        val normalized = value.trim().lowercase()
        return normalized.takeIf(sha256Pattern::matches)
    }

    fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count > 0) digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }

    fun matches(file: File, expectedSha256: String): Boolean {
        val expected = normalizeSha256(expectedSha256) ?: return false
        val actual = sha256(file)
        return MessageDigest.isEqual(
            actual.toByteArray(Charsets.US_ASCII),
            expected.toByteArray(Charsets.US_ASCII),
        )
    }
}
