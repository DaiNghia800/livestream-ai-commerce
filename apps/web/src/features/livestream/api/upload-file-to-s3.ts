/**
 * Uploads a local binary File directly to Amazon S3 using a presigned PUT URL.
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
    throw new Error(
      `Tải ảnh lên S3 thất bại (HTTP ${response.status} ${response.statusText}).`
    );
  }
}
