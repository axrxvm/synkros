module.exports = ({ sender, downloadLink, siteLink, size, expires }) => {
  return `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Synkros File Share</title>
    <style>
      @media only screen and (max-width: 620px) {
        h1 { font-size: 28px !important; margin-bottom: 10px !important; }
        p, td, span, a { font-size: 16px !important; }
        .wrapper, .article { padding: 10px !important; }
        .content { padding: 0 !important; }
        .container { padding: 0 !important; width: 100% !important; }
        .main { border-radius: 0 !important; }
        .btn a { width: 100% !important; }
        .img-responsive { height: auto !important; max-width: 100% !important; }
      }
    </style>
  </head>
  <body style="background-color: #202124; font-family: sans-serif; font-size: 14px; color: #aaa; margin: 0; padding: 0;">
    <span style="display: none; visibility: hidden;">Synkros - A file was shared with you.</span>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #202124;">
      <tr>
        <td>&nbsp;</td>
        <td class="container" style="max-width: 580px; margin: 0 auto; padding: 10px;">
          <div class="content" style="max-width: 580px; margin: 0 auto; padding: 10px;">

            <!-- Main Card -->
            <table role="presentation" width="100%" style="background: #24262b; border-radius: 6px; border: 1px solid #333;">
              <tr>
                <td class="wrapper" style="padding: 20px;">
                  <table role="presentation" width="100%">
                    <tr>
                      <td>
                        <p style="margin: 0 0 15px;">Hi there,</p>
                        <p style="margin: 0 0 15px;">
                          <strong>${sender}</strong> has shared a file with you (${size}). This file is end-to-end encrypted and will be decrypted in your browser. Click below to download:
                        </p>

                        <!-- Download Button -->
                        <table role="presentation" class="btn btn-primary" cellpadding="0" cellspacing="0" width="100%">
                          <tr>
                            <td align="left" style="padding-bottom: 15px;">
                              <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                  <td style="background-color: #4c8bf4; border-radius: 5px; text-align: center;">
                                    <a href="${downloadLink}" target="_blank" 
                                      style="display: inline-block; color: #fff; background-color: #4c8bf4; border: 1px solid #4c8bf4; border-radius: 5px; padding: 12px 25px; font-weight: bold; text-decoration: none;">
                                      Download File
                                    </a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>

                        <p style="font-size: 13px; color: #888; margin-bottom: 15px;">
                          If the button doesn’t work, copy and paste this link into your browser: <br>
                          <a href="${downloadLink}" style="color: #4c8bf4; word-break: break-all;">${downloadLink}</a><br><br>
                          This link will expire in ${expires}.
                        </p>

                        <p style="margin: 0 0 15px;">Thanks for using Synkros!</p>
                        <p style="margin: 0 0 15px;">– The Synkros Team</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Footer -->
            <div class="footer" style="text-align: center; margin-top: 10px;">
              <table role="presentation" width="100%">
                <tr>
                  <td style="font-size: 12px; color: #888;">
                    Powered by <a href="${siteLink}" style="color: #888; text-decoration: none;">Synkros</a>.
                  </td>
                </tr>
              </table>
            </div>

          </div>
        </td>
        <td>&nbsp;</td>
      </tr>
    </table>
  </body>
</html>
`;
};
