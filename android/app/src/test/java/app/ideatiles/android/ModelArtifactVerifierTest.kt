/*
 * File Purpose: Verify SHA-256 validation used by Android model activation.
 * Primary Components: Digest normalization, known-vector hashing, mismatch checks.
 * I/O: Writes temporary test files and asserts verifier results.
 */
package app.ideatiles.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ModelArtifactVerifierTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun normalizeSha256_acceptsCanonicalDigest() {
        val digest = "A".repeat(64)
        assertEquals("a".repeat(64), ModelArtifactVerifier.normalizeSha256(" $digest "))
    }

    @Test
    fun normalizeSha256_rejectsInvalidValues() {
        assertNull(ModelArtifactVerifier.normalizeSha256(""))
        assertNull(ModelArtifactVerifier.normalizeSha256("g".repeat(64)))
        assertNull(ModelArtifactVerifier.normalizeSha256("a".repeat(63)))
    }

    @Test
    fun matches_verifiesKnownSha256AndRejectsMismatch() {
        val file = temporaryFolder.newFile("model.litertlm")
        file.writeText("Idea Tiles")
        val expected = "a06d792a062dbd0ba1a644f220f4458e563536f88698331a89804f0f55effc38"

        assertEquals(expected, ModelArtifactVerifier.sha256(file))
        assertTrue(ModelArtifactVerifier.matches(file, expected))
        assertFalse(ModelArtifactVerifier.matches(file, "0".repeat(64)))
    }
}
