/**
 * Uploads a local binary File to an upload destination using a PUT URL.
 */
export async function uploadFileToS3(
  uploadUrl: string,
  file: File,
  contentType: string
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: file,
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error && error.message
        ? `Không thể kết nối tới S3 (${error.message}). Vui lòng kiểm tra kết nối mạng.`
        : "Không thể kết nối tới S3 để tải ảnh.";
    throw new Error(errorMsg);
  }

  if (!response.ok) {
    let responseMessage = "";
    try {
      const responseBody = await response.text();
      if (responseBody) {
        responseMessage = ` ${responseBody.slice(0, 300)}`;
      }
    } catch {
      // Keep the HTTP status message when the server response cannot be read.
    }
    throw new Error(
      `Tải ảnh lên thất bại (HTTP ${response.status} ${response.statusText}).${responseMessage}`
    );
  }
}
