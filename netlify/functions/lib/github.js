// GitHub API helper for Rozvoz Pejr
// Adapted from WebZitra — uses Git Data API for atomic multi-file commits

const GITHUB_API = 'https://api.github.com';
const REPO = process.env.GITHUB_REPO || 'lukaspalda/rozvoz-pejr';

function headers() {
    return {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Rozvoz-Pejr'
    };
}

/**
 * Fetch a single file's content from the repo
 */
async function fetchFile(path, branch = 'main') {
    const url = `${GITHUB_API}/repos/${REPO}/contents/${path}?ref=${branch}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`GitHub: Cannot fetch ${path}: ${res.status}`);
    }
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { content, sha: data.sha };
}

/**
 * Fetch and parse a JSON file
 */
async function fetchJSON(path) {
    const result = await fetchFile(path);
    if (!result) return null;
    return JSON.parse(result.content);
}

/**
 * Save a JSON file via Git Data API (atomic commit)
 */
async function saveJSON(path, data, message) {
    const content = JSON.stringify(data, null, 2);
    return commitFile(path, content, message);
}

/**
 * Commit a single file
 */
async function commitFile(path, content, message) {
    const h = headers();

    // 1. Get current commit SHA
    const refRes = await fetch(`${GITHUB_API}/repos/${REPO}/git/ref/heads/main`, { headers: h });
    if (!refRes.ok) throw new Error(`GitHub: Cannot get ref: ${refRes.status}`);
    const refData = await refRes.json();
    const currentCommitSha = refData.object.sha;

    // 2. Get current tree SHA
    const commitRes = await fetch(`${GITHUB_API}/repos/${REPO}/git/commits/${currentCommitSha}`, { headers: h });
    if (!commitRes.ok) throw new Error(`GitHub: Cannot get commit: ${commitRes.status}`);
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blob
    const blobRes = await fetch(`${GITHUB_API}/repos/${REPO}/git/blobs`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ content, encoding: 'utf-8' })
    });
    if (!blobRes.ok) throw new Error(`GitHub: Cannot create blob: ${blobRes.status}`);
    const blobData = await blobRes.json();

    // 4. Create tree
    const treeRes = await fetch(`${GITHUB_API}/repos/${REPO}/git/trees`, {
        method: 'POST', headers: h,
        body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: [{ path, mode: '100644', type: 'blob', sha: blobData.sha }]
        })
    });
    if (!treeRes.ok) throw new Error(`GitHub: Cannot create tree: ${treeRes.status}`);
    const treeData = await treeRes.json();

    // 5. Create commit
    const newCommitRes = await fetch(`${GITHUB_API}/repos/${REPO}/git/commits`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ message, tree: treeData.sha, parents: [currentCommitSha] })
    });
    if (!newCommitRes.ok) throw new Error(`GitHub: Cannot create commit: ${newCommitRes.status}`);
    const newCommitData = await newCommitRes.json();

    // 6. Update ref
    const updateRefRes = await fetch(`${GITHUB_API}/repos/${REPO}/git/refs/heads/main`, {
        method: 'PATCH', headers: h,
        body: JSON.stringify({ sha: newCommitData.sha })
    });
    if (!updateRefRes.ok) throw new Error(`GitHub: Cannot update ref: ${updateRefRes.status}`);

    return { sha: newCommitData.sha };
}

module.exports = { fetchFile, fetchJSON, saveJSON, commitFile };
