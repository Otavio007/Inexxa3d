import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
export async function pickFile(type: string | string[] = "*/*") {
  const result = await DocumentPicker.getDocumentAsync({
    type,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const bytes = asset.file
    ? await asset.file.arrayBuffer()
    : await new File(asset.uri).arrayBuffer();
  return {
    name: asset.name,
    mime: asset.mimeType ?? "application/octet-stream",
    bytes,
  };
}
